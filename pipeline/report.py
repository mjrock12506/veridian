"""Phase 7 reports/alerts: a brief risk digest from the warehouse.

Generates a short summary — order counts and the top at-risk orders — and
either saves it to ``reports/digests/`` and/or emails it. Designed to run right
after an incremental ETL pass (locally or from the GitHub Actions cron):

    python -m pipeline.report                 # save a Markdown + JSON digest
    python -m pipeline.report --email         # also email it (if SMTP is set)
    python -m pipeline.report --stdout        # print the text digest

Email is provider-agnostic: it speaks plain SMTP, configured entirely from env
vars (works with Gmail, SendGrid, Mailgun, Amazon SES, etc.). Nothing is
hardcoded — if the SMTP/recipient vars are absent, the email step is skipped
with a clear message and the digest is still saved.

The report degrades gracefully: it always reports observed counts from the
warehouse labels, and *additionally* reports model-predicted risk and a ranked
top-at-risk list when the trained model artifacts are present.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import smtplib
import sys
from email.message import EmailMessage
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import create_engine

from . import config

DIGEST_DIR = config.ROOT / "reports" / "digests"
TOP_N = 10


# --------------------------------------------------------------------------- #
# Data + scoring
# --------------------------------------------------------------------------- #
def _load_scored_frame() -> tuple[pd.DataFrame, bool]:
    """Load delivered orders from the warehouse, scored if models are available.

    Returns ``(frame, models_loaded)``. When models are present the frame gains
    ``delay_probability`` / ``low_review_probability`` / ``*_flag`` columns.
    """
    engine = create_engine(config.DATABASE_URL)
    feats = pd.read_sql_table(config.FEATURES_TABLE, engine)
    feats.columns = [str(c) for c in feats.columns]

    # Pull display + post-outcome columns the low_review model expects (it is
    # allowed to see delivery outcomes; the delay model is not). Mirrors the
    # dashboard's frame so scoring matches the API.
    try:
        orders = pd.read_sql_table(config.ORDERS_TABLE, engine)
        orders.columns = [str(c) for c in orders.columns]
        extra = ["order_id", "order_purchase_timestamp", "actual_delivery_days",
                 "delivery_vs_estimate_days", "review_score"]
        feats = feats.merge(
            orders[[c for c in extra if c in orders.columns]], on="order_id", how="left"
        )
    except Exception:
        feats["order_purchase_timestamp"] = None

    # is_late_int: numeric form of the is_late label used as a model feature.
    if "is_late" in feats:
        feats["is_late_int"] = feats["is_late"].map(
            lambda v: 1.0 if v in (True, 1, 1.0, "True", "true")
            else (0.0 if v in (False, 0, 0.0, "False", "false") else np.nan)
        )

    models_loaded = False
    try:
        from api import registry  # lazy: keep the report usable without the API pkg

        reg = registry.Registry()
        reg.load()
        if reg.loaded_names:
            for name, prob_col, flag_col in (
                ("delay", "delay_probability", "delay_flag"),
                ("low_review", "low_review_probability", "low_review_flag"),
            ):
                model = reg.get(name)
                X = feats[model.numeric + model.categorical].copy()
                for col in model.categorical:
                    X[col] = X[col].astype(object)
                proba = model.pipeline.predict_proba(X)[:, 1]
                feats[prob_col] = proba
                feats[flag_col] = proba >= float(model.threshold)
            models_loaded = True
    except Exception as exc:  # missing artifacts / api pkg -> observed-only report
        print(f"[report] models not scored ({exc}); reporting observed labels only.")

    return feats, models_loaded


def _as_bool_count(series: pd.Series, truthy=(True, 1, 1.0, "True", "true")) -> int:
    return int(series.isin(truthy).sum())


def build_summary(top_n: int = TOP_N, generated_at: dt.datetime | None = None) -> dict:
    """Compute the digest payload: counts + top at-risk orders."""
    generated_at = generated_at or dt.datetime.now(dt.timezone.utc)
    df, models_loaded = _load_scored_frame()

    total = int(len(df))
    delivered_mask = df["order_status"] == "delivered" if "order_status" in df else pd.Series(True, index=df.index)
    delivered = df[delivered_mask]
    n_delivered = int(len(delivered))

    observed = {
        "late_deliveries": _as_bool_count(df["is_late"]) if "is_late" in df else None,
        "low_reviews": _as_bool_count(df["low_review"]) if "low_review" in df else None,
    }

    predicted: dict | None = None
    top_orders: list[dict] = []
    if models_loaded:
        d = delivered.copy()
        d["combined_risk"] = d[["delay_probability", "low_review_probability"]].max(axis=1)
        predicted = {
            "delay_at_risk": int(d["delay_flag"].sum()),
            "delay_at_risk_pct": round(float(d["delay_flag"].mean()) * 100, 1) if len(d) else 0.0,
            "low_review_at_risk": int(d["low_review_flag"].sum()),
            "low_review_at_risk_pct": round(float(d["low_review_flag"].mean()) * 100, 1) if len(d) else 0.0,
            "high_risk_orders": int((d["combined_risk"] >= 0.5).sum()),
        }
        top = d.sort_values("combined_risk", ascending=False).head(top_n)
        for _, r in top.iterrows():
            top_orders.append(
                {
                    "order_id": str(r["order_id"]),
                    "customer_state": _clean(r.get("customer_state")),
                    "main_category": _clean(r.get("main_category")),
                    "total_price": _num(r.get("total_price")),
                    "delay_probability": round(float(r["delay_probability"]), 4),
                    "low_review_probability": round(float(r["low_review_probability"]), 4),
                    "combined_risk": round(float(r["combined_risk"]), 4),
                }
            )
    else:
        # Observed-risk fallback: most recent orders the data marks as late.
        if "is_late" in df:
            late = df[df["is_late"].isin([True, 1, 1.0, "True", "true"])].copy()
            late = late.sort_values("order_purchase_timestamp", ascending=False).head(top_n)
            for _, r in late.iterrows():
                top_orders.append(
                    {
                        "order_id": str(r["order_id"]),
                        "customer_state": _clean(r.get("customer_state")),
                        "main_category": _clean(r.get("main_category")),
                        "total_price": _num(r.get("total_price")),
                        "purchase_date": _date(r.get("order_purchase_timestamp")),
                    }
                )

    return {
        "generated_at": generated_at.isoformat(timespec="seconds"),
        "database": _safe_db_label(config.DATABASE_URL),
        "models_loaded": models_loaded,
        "counts": {"total_orders": total, "delivered_orders": n_delivered, **observed},
        "predicted": predicted,
        "top_at_risk": top_orders,
    }


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #
def render_markdown(summary: dict) -> str:
    c = summary["counts"]
    lines = [
        "# Veridian risk digest",
        "",
        f"- **Generated:** {summary['generated_at']}",
        f"- **Warehouse:** `{summary['database']}`",
        f"- **Orders in warehouse:** {c['total_orders']:,} ({c['delivered_orders']:,} delivered)",
    ]
    if c.get("late_deliveries") is not None:
        lines.append(f"- **Observed late deliveries:** {c['late_deliveries']:,}")
    if c.get("low_reviews") is not None:
        lines.append(f"- **Observed low reviews (1–2★):** {c['low_reviews']:,}")

    p = summary["predicted"]
    if p:
        lines += [
            "",
            "## Predicted risk (delivered orders)",
            "",
            f"- **Delay at-risk:** {p['delay_at_risk']:,} ({p['delay_at_risk_pct']}%)",
            f"- **Low-review at-risk:** {p['low_review_at_risk']:,} ({p['low_review_at_risk_pct']}%)",
            f"- **High-risk (≥50%):** {p['high_risk_orders']:,}",
        ]
        lines += ["", "## Top at-risk orders", "",
                  "| Order | State | Category | Price | Delay | Low-review |",
                  "|---|---|---|--:|--:|--:|"]
        for o in summary["top_at_risk"]:
            lines.append(
                f"| `{o['order_id'][:10]}…` | {o['customer_state'] or '—'} | "
                f"{o['main_category'] or '—'} | {_money(o['total_price'])} | "
                f"{_pct(o['delay_probability'])} | {_pct(o['low_review_probability'])} |"
            )
    else:
        lines += ["", "## Most recent late deliveries (observed)",
                  "_Model artifacts not found — showing observed late orders. "
                  "Train models (`python -m models.train`) for predicted risk._", "",
                  "| Order | State | Category | Price | Purchased |",
                  "|---|---|---|--:|---|"]
        for o in summary["top_at_risk"]:
            lines.append(
                f"| `{o['order_id'][:10]}…` | {o.get('customer_state') or '—'} | "
                f"{o.get('main_category') or '—'} | {_money(o.get('total_price'))} | "
                f"{o.get('purchase_date') or '—'} |"
            )
    return "\n".join(lines) + "\n"


def render_text(summary: dict) -> str:
    """Plain-text version for email bodies / stdout."""
    c = summary["counts"]
    out = [
        "VERIDIAN RISK DIGEST",
        f"Generated: {summary['generated_at']}",
        f"Warehouse: {summary['database']}",
        f"Orders: {c['total_orders']:,} ({c['delivered_orders']:,} delivered)",
    ]
    if c.get("late_deliveries") is not None:
        out.append(f"Observed late deliveries: {c['late_deliveries']:,}")
    if c.get("low_reviews") is not None:
        out.append(f"Observed low reviews (1-2 star): {c['low_reviews']:,}")
    p = summary["predicted"]
    if p:
        out += [
            "",
            f"Delay at-risk: {p['delay_at_risk']:,} ({p['delay_at_risk_pct']}%)",
            f"Low-review at-risk: {p['low_review_at_risk']:,} ({p['low_review_at_risk_pct']}%)",
            f"High-risk (>=50%): {p['high_risk_orders']:,}",
            "",
            "Top at-risk orders:",
        ]
        for o in summary["top_at_risk"]:
            out.append(
                f"  {o['order_id']}  {o['customer_state'] or '-':>3}  "
                f"delay={_pct(o['delay_probability'])}  low_review={_pct(o['low_review_probability'])}"
            )
    else:
        out += ["", "Most recent late deliveries (observed; train models for predicted risk):"]
        for o in summary["top_at_risk"]:
            out.append(f"  {o['order_id']}  {o.get('customer_state') or '-':>3}  {o.get('purchase_date') or ''}")
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# Sinks: save + email
# --------------------------------------------------------------------------- #
def save_digest(summary: dict, markdown: str) -> dict[str, Path]:
    """Write the Markdown digest + JSON payload, and refresh `latest.*`."""
    DIGEST_DIR.mkdir(parents=True, exist_ok=True)
    stamp = summary["generated_at"].replace(":", "").replace("-", "").replace("+0000", "")
    md_path = DIGEST_DIR / f"digest_{stamp}.md"
    json_path = DIGEST_DIR / f"digest_{stamp}.json"
    md_path.write_text(markdown)
    json_path.write_text(json.dumps(summary, indent=2) + "\n")
    (DIGEST_DIR / "latest.md").write_text(markdown)
    (DIGEST_DIR / "latest.json").write_text(json.dumps(summary, indent=2) + "\n")
    return {"markdown": md_path, "json": json_path}


def _env(*names: str) -> str | None:
    for n in names:
        v = os.environ.get(n)
        if v:
            return v.strip()
    return None


def send_email(summary: dict, body_text: str, body_html: str | None = None) -> bool:
    """Email the digest over SMTP using env config. Returns True if sent.

    Required env: SMTP_HOST, ALERT_EMAIL_FROM, ALERT_EMAIL_TO.
    Optional: SMTP_PORT (587), SMTP_USERNAME, SMTP_PASSWORD,
    SMTP_STARTTLS (true), SMTP_SSL (false). No credentials are ever hardcoded.
    """
    host = _env("SMTP_HOST")
    sender = _env("ALERT_EMAIL_FROM", "SMTP_FROM")
    recipients = _env("ALERT_EMAIL_TO", "SMTP_TO")
    if not (host and sender and recipients):
        print("[report] email skipped: set SMTP_HOST, ALERT_EMAIL_FROM, ALERT_EMAIL_TO to enable.")
        return False

    to_list = [r.strip() for r in recipients.split(",") if r.strip()]
    port = int(_env("SMTP_PORT") or 587)
    username = _env("SMTP_USERNAME", "SMTP_USER")
    password = _env("SMTP_PASSWORD", "SMTP_PASS")
    use_ssl = (_env("SMTP_SSL") or "false").lower() in ("1", "true", "yes")
    use_starttls = (_env("SMTP_STARTTLS") or "true").lower() in ("1", "true", "yes")

    p = summary.get("predicted") or {}
    high = p.get("high_risk_orders")
    subject = "Veridian risk digest — " + (
        f"{high} high-risk orders" if high is not None else "observed summary"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(to_list)
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    server = smtplib.SMTP_SSL(host, port) if use_ssl else smtplib.SMTP(host, port)
    try:
        if use_starttls and not use_ssl:
            server.starttls()
        if username and password:
            server.login(username, password)
        server.send_message(msg)
    finally:
        server.quit()
    print(f"[report] emailed digest to {', '.join(to_list)} via {host}:{port}")
    return True


# --------------------------------------------------------------------------- #
# small formatters
# --------------------------------------------------------------------------- #
def _clean(v):
    return None if (v is None or (isinstance(v, float) and pd.isna(v))) else str(v)


def _num(v):
    try:
        f = float(v)
        return None if pd.isna(f) else round(f, 2)
    except (TypeError, ValueError):
        return None


def _date(v):
    ts = pd.to_datetime(v, errors="coerce")
    return None if pd.isna(ts) else ts.date().isoformat()


def _money(v):
    return "—" if v is None else f"R${v:,.0f}"


def _pct(v):
    return "—" if v is None else f"{v * 100:.0f}%"


def _safe_db_label(url: str) -> str:
    """Hide any credentials in the DB URL before printing it."""
    if "@" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        return f"{scheme}://***@{rest.split('@', 1)[1]}"
    return url


# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Veridian risk digest (Phase 7).")
    parser.add_argument("--top", type=int, default=TOP_N, help="Top at-risk orders to list.")
    parser.add_argument("--email", action="store_true", help="Email the digest (needs SMTP env).")
    parser.add_argument("--no-save", action="store_true", help="Do not write digest files.")
    parser.add_argument("--stdout", action="store_true", help="Print the text digest to stdout.")
    args = parser.parse_args(argv)

    try:
        summary = build_summary(top_n=args.top)
    except Exception as exc:
        print(f"[report] could not build summary: {exc}", file=sys.stderr)
        print("[report] run the ETL first (`python -m pipeline.run`).", file=sys.stderr)
        return 1

    markdown = render_markdown(summary)
    text = render_text(summary)

    if not args.no_save:
        paths = save_digest(summary, markdown)
        print(f"[report] saved {paths['markdown'].relative_to(config.ROOT)} (+ JSON, latest.*)")
    if args.stdout:
        print("\n" + text)
    if args.email:
        send_email(summary, text)

    return 0


if __name__ == "__main__":
    sys.exit(main())
