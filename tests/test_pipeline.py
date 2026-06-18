"""Unit tests for the Phase 2 ETL pipeline.

Fast and self-contained: they build tiny synthetic raw tables (no dependency on
the full Olist CSVs) and assert the core invariants — no order fan-out on join,
correct label logic, a sane haversine distance, and idempotent loads.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from pipeline import load, transform


def _mini_raw() -> dict[str, pd.DataFrame]:
    """A 3-order synthetic Olist-shaped dataset."""
    orders = pd.DataFrame({
        "order_id": ["o1", "o2", "o3"],
        "customer_id": ["c1", "c2", "c3"],
        "order_status": ["delivered", "delivered", "canceled"],
        "order_purchase_timestamp": ["2018-01-01 10:00:00", "2018-02-01 09:00:00", "2018-03-01 08:00:00"],
        "order_approved_at": ["2018-01-01 11:00:00", "2018-02-01 12:00:00", None],
        "order_delivered_carrier_date": ["2018-01-02 10:00:00", "2018-02-02 10:00:00", None],
        # o1 delivered early (before estimate), o2 delivered late, o3 never delivered
        "order_delivered_customer_date": ["2018-01-05 10:00:00", "2018-02-20 10:00:00", None],
        "order_estimated_delivery_date": ["2018-01-10", "2018-02-15", "2018-03-20"],
    })
    customers = pd.DataFrame({
        "customer_id": ["c1", "c2", "c3"],
        "customer_unique_id": ["u1", "u2", "u3"],
        "customer_zip_code_prefix": [1000, 2000, 1000],
        "customer_city": ["sao paulo", "rio", "sao paulo"],
        "customer_state": ["SP", "RJ", "SP"],
    })
    items = pd.DataFrame({
        "order_id": ["o1", "o2", "o2", "o3"],
        "order_item_id": [1, 1, 2, 1],
        "product_id": ["p1", "p2", "p2", "p1"],
        "seller_id": ["s1", "s2", "s2", "s1"],
        "shipping_limit_date": ["2018-01-03", "2018-02-03", "2018-02-03", "2018-03-03"],
        "price": [100.0, 50.0, 50.0, 30.0],
        "freight_value": [10.0, 5.0, 5.0, 3.0],
    })
    payments = pd.DataFrame({
        "order_id": ["o1", "o2", "o3"],
        "payment_sequential": [1, 1, 1],
        "payment_type": ["credit_card", "boleto", "voucher"],
        "payment_installments": [3, 1, 1],
        "payment_value": [110.0, 110.0, 33.0],
    })
    reviews = pd.DataFrame({
        "review_id": ["r1", "r2", "r3"],
        "order_id": ["o1", "o2", "o3"],
        "review_score": [5, 1, 3],
        "review_comment_title": [None, None, None],
        "review_comment_message": [None, "bad", None],
        "review_creation_date": ["2018-01-06", "2018-02-21", "2018-03-05"],
        "review_answer_timestamp": ["2018-01-07 10:00:00", "2018-02-22 10:00:00", "2018-03-06 10:00:00"],
    })
    products = pd.DataFrame({
        "product_id": ["p1", "p2"],
        "product_category_name": ["cama_mesa_banho", "informatica_acessorios"],
        "product_name_lenght": [40.0, 50.0],
        "product_description_lenght": [200.0, 300.0],
        "product_photos_qty": [1.0, 2.0],
        "product_weight_g": [500.0, 1200.0],
        "product_length_cm": [20.0, 30.0],
        "product_height_cm": [10.0, 15.0],
        "product_width_cm": [15.0, 20.0],
    })
    sellers = pd.DataFrame({
        "seller_id": ["s1", "s2"],
        "seller_zip_code_prefix": [3000, 4000],
        "seller_city": ["campinas", "curitiba"],
        "seller_state": ["SP", "PR"],
    })
    geolocation = pd.DataFrame({
        "geolocation_zip_code_prefix": [1000, 2000, 3000, 4000],
        "geolocation_lat": [-23.55, -22.90, -22.90, -25.43],
        "geolocation_lng": [-46.63, -43.20, -47.06, -49.27],
        "geolocation_city": ["sao paulo", "rio", "campinas", "curitiba"],
        "geolocation_state": ["SP", "RJ", "SP", "PR"],
    })
    category_translation = pd.DataFrame({
        "product_category_name": ["cama_mesa_banho", "informatica_acessorios"],
        "product_category_name_english": ["bed_bath_table", "computers_accessories"],
    })
    return {
        "orders": orders, "customers": customers, "items": items,
        "payments": payments, "reviews": reviews, "products": products,
        "sellers": sellers, "geolocation": geolocation,
        "category_translation": category_translation,
    }


def test_haversine_known_distance():
    # Sao Paulo (-23.55,-46.63) to Rio (-22.91,-43.17) ~ 360 km.
    d = transform._haversine_km(-23.55, -46.63, -22.91, -43.17)
    assert 330 < float(d) < 390


def test_build_order_level_no_fanout():
    raw = _mini_raw()
    df = transform.build_order_level(raw)
    assert len(df) == len(raw["orders"]) == 3
    assert df["order_id"].is_unique
    # o2 has two item lines -> aggregated, not duplicated
    assert df.loc[df.order_id == "o2", "n_items"].iat[0] == 2
    assert df.loc[df.order_id == "o2", "n_sellers"].iat[0] == 1


def test_delivery_metrics_and_late_flag():
    df = transform.build_order_level(_mini_raw()).set_index("order_id")
    assert df.loc["o1", "is_late"] is False or df.loc["o1", "is_late"] == False  # early
    assert df.loc["o2", "is_late"] == True  # delivered after estimate
    # undelivered order has NA late flag, not False
    assert pd.isna(df.loc["o3", "is_late"])


def test_labels():
    order_level = transform.build_order_level(_mini_raw())
    labels = transform.add_labels(order_level).set_index("order_id")
    # o2: 1-star review -> low_review True and complaint True
    assert labels.loc["o2", "low_review"] == True
    assert labels.loc["o2", "is_complaint"] == True
    # o1: 5-star -> not low_review, not complaint
    assert labels.loc["o1", "low_review"] == False
    assert labels.loc["o1", "is_complaint"] == False
    # o3: canceled -> complaint True regardless of its 3-star review
    assert labels.loc["o3", "is_complaint"] == True
    assert labels.loc["o3", "low_review"] == False


def test_engineer_features_shape():
    order_level = transform.build_order_level(_mini_raw())
    feats = transform.engineer_features(order_level)
    assert len(feats) == 3
    assert "order_id" in feats.columns
    for col in ("freight_ratio", "purchase_dow", "customer_seller_distance_km"):
        assert col in feats.columns
    # freight_ratio in [0,1]
    fr = feats["freight_ratio"].dropna()
    assert ((fr >= 0) & (fr <= 1)).all()


def test_idempotent_load(tmp_path):
    engine = load.make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    df = pd.DataFrame({"a": [1, 2, 3], "b": [True, False, None]})
    n1 = load.load_table(df, "t", engine)
    n2 = load.load_table(df, "t", engine)  # replace, not append
    assert n1 == n2 == 3
