# Veridian — Data Dictionary

Source: **Olist Brazilian E-Commerce Public Dataset** (~100k orders placed on the
Olist marketplace, 2016–2018). Nine raw CSVs in `data/raw/` (gitignored). This
document describes every raw table and column, then the **order-level table**
that the Phase 1 EDA builds (`notebooks/01_eda_olist.ipynb`).

All timestamps are local Brazilian time, format `YYYY-MM-DD HH:MM:SS`. Currency
is Brazilian Real (BRL). Primary keys are 32-char hashes unless noted.

---

## Entity-relationship overview

```
customers ─1─┐
             └─< orders >─1── reviews (≈1 per order)
                   │
                   ├─< order_items >── products ── category_translation
                   │        └────────── sellers
                   └─< order_payments
geolocation: lookup by zip_code_prefix for customers & sellers
```

- `orders` is the central fact table — one row per order.
- `order_items`, `order_payments` are **many-per-order**; `reviews` is
  **~one-per-order** (551 orders have a duplicate review id).
- `products`, `sellers`, `customers`, `geolocation` are dimension/lookup tables.

---

## 1. `olist_orders_dataset.csv` — orders (fact)
99,441 rows × 8 cols. Grain: one row per **order**. PK: `order_id`.

| Column | Type | Description |
|---|---|---|
| `order_id` | str | Unique order id. **PK.** |
| `customer_id` | str | FK → `customers.customer_id`. One id per order (a per-order key, *not* a person). |
| `order_status` | str | Order state: `delivered` (96,478), `shipped`, `canceled`, `unavailable`, `invoiced`, `processing`, `created`, `approved`. |
| `order_purchase_timestamp` | datetime | When the order was placed. The "clock start" for all delivery durations. |
| `order_approved_at` | datetime | Payment approval time. Missing for 160 orders. |
| `order_delivered_carrier_date` | datetime | Handoff to the logistics carrier. Missing for 1,783 (not yet shipped/canceled). |
| `order_delivered_customer_date` | datetime | Delivery to the customer. **Missing for 2,965** (undelivered/canceled) — drives the main missingness. |
| `order_estimated_delivery_date` | datetime | Delivery estimate shown to the customer at purchase. Always present. |

## 2. `olist_customers_dataset.csv` — customers (dimension)
99,441 rows × 5 cols. Grain: one row per **per-order customer key**. PK: `customer_id`.

| Column | Type | Description |
|---|---|---|
| `customer_id` | str | Per-order customer key. **PK.** Joins to `orders.customer_id`. |
| `customer_unique_id` | str | Stable identifier for the actual person across orders (96,096 distinct → some repeat buyers). |
| `customer_zip_code_prefix` | int | First 5 digits of the customer ZIP. FK → `geolocation`. |
| `customer_city` | str | Customer city (lowercased, unaccented). |
| `customer_state` | str | 2-letter Brazilian state (e.g. `SP`, `RJ`, `MG`). |

## 3. `olist_order_items_dataset.csv` — order line items (fact)
112,650 rows × 7 cols. Grain: one row per **item line within an order**. PK: (`order_id`, `order_item_id`).

| Column | Type | Description |
|---|---|---|
| `order_id` | str | FK → `orders.order_id`. |
| `order_item_id` | int | Sequence number of the item within the order (1, 2, 3, …). Max count = items in the order. |
| `product_id` | str | FK → `products.product_id`. |
| `seller_id` | str | FK → `sellers.seller_id`. |
| `shipping_limit_date` | datetime | Seller's deadline to hand the item to the carrier. |
| `price` | float | Item price (BRL), excluding freight. |
| `freight_value` | float | Freight/shipping cost allocated to this item (BRL). |

## 4. `olist_order_payments_dataset.csv` — payments (fact)
103,886 rows × 5 cols. Grain: one row per **payment installment record**. PK: (`order_id`, `payment_sequential`).

| Column | Type | Description |
|---|---|---|
| `order_id` | str | FK → `orders.order_id`. |
| `payment_sequential` | int | Sequence of payment methods used for the order. |
| `payment_type` | str | `credit_card`, `boleto`, `voucher`, `debit_card`, `not_defined`. |
| `payment_installments` | int | Number of installments chosen. |
| `payment_value` | float | Value of this payment record (BRL). |

## 5. `olist_order_reviews_dataset.csv` — reviews (fact, ≈1 per order)
99,224 rows × 7 cols (98,673 distinct orders). Grain: one row per **review**. PK: `review_id`.

| Column | Type | Description |
|---|---|---|
| `review_id` | str | Unique review id. **PK.** |
| `order_id` | str | FK → `orders.order_id`. |
| `review_score` | int | Customer rating, **1–5 stars**. Target signal for the satisfaction model. |
| `review_comment_title` | str | Optional free-text title (mostly null; Portuguese). |
| `review_comment_message` | str | Optional free-text body (~58% null; Portuguese). Used by Phase 3 review NLP. |
| `review_creation_date` | datetime | When the review survey was sent. |
| `review_answer_timestamp` | datetime | When the customer submitted the review. |

## 6. `olist_products_dataset.csv` — products (dimension)
32,951 rows × 9 cols. Grain: one row per **product**. PK: `product_id`.

| Column | Type | Description |
|---|---|---|
| `product_id` | str | Unique product id. **PK.** |
| `product_category_name` | str | Category in Portuguese (610 products null). Join key to the translation table. |
| `product_name_lenght` | float | Character length of the product name. (Original misspelling "lenght" preserved.) |
| `product_description_lenght` | float | Character length of the description. |
| `product_photos_qty` | float | Number of published product photos. |
| `product_weight_g` | float | Product weight in grams. |
| `product_length_cm` | float | Package length (cm). |
| `product_height_cm` | float | Package height (cm). |
| `product_width_cm` | float | Package width (cm). |

## 7. `olist_sellers_dataset.csv` — sellers (dimension)
3,095 rows × 4 cols. Grain: one row per **seller**. PK: `seller_id`.

| Column | Type | Description |
|---|---|---|
| `seller_id` | str | Unique seller id. **PK.** |
| `seller_zip_code_prefix` | int | First 5 digits of the seller ZIP. FK → `geolocation`. |
| `seller_city` | str | Seller city. |
| `seller_state` | str | 2-letter Brazilian state. |

## 8. `olist_geolocation_dataset.csv` — geolocation (lookup)
1,000,163 rows × 5 cols. Grain: one row per **(zip prefix, lat/lng) point** (many points per prefix).

| Column | Type | Description |
|---|---|---|
| `geolocation_zip_code_prefix` | int | First 5 digits of a Brazilian ZIP. Join key for customers & sellers. |
| `geolocation_lat` | float | Latitude. |
| `geolocation_lng` | float | Longitude. |
| `geolocation_city` | str | City name. |
| `geolocation_state` | str | 2-letter state. |

*Note:* not joined in Phase 1 (needs aggregation to one lat/lng per prefix); reserved for distance features in Phase 2.

## 9. `product_category_name_translation.csv` — category translation (lookup)
71 rows × 2 cols. Grain: one row per **category**.

| Column | Type | Description |
|---|---|---|
| `product_category_name` | str | Category name in Portuguese. Join key to `products`. |
| `product_category_name_english` | str | English translation (used for readable charts/labels). |

---

## Order-level table (Phase 1 output)

Built in `notebooks/01_eda_olist.ipynb` and written to
`data/processed/orders_order_level.csv` (gitignored derived artifact).
**Grain: one row per order** (99,441 rows). It is `orders` left-joined to
`customers`, plus order-level aggregates of items/payments/reviews, plus derived
delivery metrics. Columns below are those added on top of the raw `orders` +
`customers` columns documented above.

### Aggregated from `order_items` (per order)
| Column | Type | Description |
|---|---|---|
| `n_items` | float | Count of item lines in the order. |
| `n_sellers` | float | Distinct sellers in the order. |
| `n_products` | float | Distinct products in the order. |
| `total_price` | float | Sum of item prices (BRL). |
| `total_freight` | float | Sum of freight values (BRL). |
| `main_category` | str | Dominant (modal) English product category for the order. |

### Aggregated from `order_payments` (per order)
| Column | Type | Description |
|---|---|---|
| `total_payment_value` | float | Sum of all payment records (BRL). |
| `n_payments` | float | Number of payment records. |
| `max_installments` | float | Maximum installments across payments. |
| `primary_payment_type` | str | Payment type of the single highest-value payment. |

### From `reviews` (one kept per order — latest answered)
| Column | Type | Description |
|---|---|---|
| `review_score` | float | 1–5 star score; null when the order has no review (~0.8%). |
| `review_creation_date` | datetime | Review survey creation date for the kept review. |

### Derived delivery metrics (all in days)
| Column | Type | Description |
|---|---|---|
| `actual_delivery_days` | float | `order_delivered_customer_date − order_purchase_timestamp`. Null if undelivered. |
| `estimated_delivery_days` | float | `order_estimated_delivery_date − order_purchase_timestamp`. |
| `delivery_vs_estimate_days` | float | `delivered − estimated`. **Positive = late.** |
| `is_late` | bool | `delivery_vs_estimate_days > 0`. Core proxy label for "order went wrong." |

### Known data-quality notes
- **Structural missingness**, not corruption: undelivered/canceled orders lack
  `order_delivered_customer_date` (→ null delivery metrics); ~0.8% of orders have
  no review.
- `order_status` should be respected when modeling delivery: compute timing
  metrics on `delivered` orders only.
- Column misspellings `product_name_lenght` / `product_description_lenght` are
  from the source data and kept as-is for traceability.
- `geolocation` has duplicate points per ZIP prefix — aggregate before joining.
- `customer_id` is per-order; use `customer_unique_id` to identify repeat buyers.
