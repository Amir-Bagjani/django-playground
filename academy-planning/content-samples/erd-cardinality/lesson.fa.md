---
id: DB-03-002
slug: cardinality
title_fa: 'Cardinality و Crow’s Foot'
locale: fa-IR
version: 1
status: approved
objectives:
- بتواند رابطه یک‌به‌یک، یک‌به‌چند و چندبه‌چند را از سناریو استخراج کند.
- بتواند کارتینالیتی و Optionality هر سمت رابطه را با نشانه‌گذاری Crow’s Foot بخواند و بنویسد.
- بتواند سمت درست کلید خارجی را در رابطه یک‌به‌چند تشخیص دهد و در ERD مشخص کند.
- بتواند معادل SQL و Django یک رابطه را از روی دیاگرام توضیح دهد.
exercise_ids:
- erd-customer-order
prerequisites:
- DB-03-001
references:
- label: MySQL Foreign Key Constraints
  url: https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html
- label: Django ForeignKey Fields
  url: https://docs.djangoproject.com/en/6.1/ref/models/fields/#foreignkey
estimated_minutes: 35
---

# Cardinality و Crow’s Foot

> **هدف:** بعد از این درس می‌توانی یک سناریوی کسب‌وکار را بخوانی، برای هر رابطه سمت «یک» و «چند» را تعیین کنی، اجباری یا اختیاری‌بودن هر سمت را مشخص کنی و همان تصمیم را روی ERD، در SQL و در Django پیاده کنی. طراحی دیاگرام را **خودت** انجام می‌دهی.

## ۱. چرا کارتینالیتی مهم است؟

اگر یک سفارش چند مشتری داشته باشد، شناسه‌ی هر مشتری باید کجا ذخیره شود؟ پاسخ این پرسش همان **Cardinality** (تعداد) و **Optionality** (اجباری/اختیاری) است. اگر این تصمیم پیش از کدنویسی روشن نباشد، ستون کلید خارجی جای اشتباه قرار می‌گیرد و داده تناقض‌دار می‌شود.

## ۲. سه نوع رابطه

- **یک‌به‌یک (1:1):** هر رکورد در دو جدول حداکثر به یک رکورد دیگر وصل است؛ مثل «کاربر ↔ پروفایل». معمولاً با یک کلید خارجی **UNIQUE** پیاده می‌شود.
- **یک‌به‌چند (1:N):** یک رکورد در سمت «یک» به چند رکورد در سمت «چند» وصل می‌شود؛ مثل «مشتری ↔ سفارش‌ها». کلید خارجی **سمت «چند»** قرار می‌گیرد.
- **چندبه‌چند (N:M):** دو طرف هر کدام می‌توانند چند رابطه داشته باشند؛ مثل «دانشجو ↔ درس». در مدل رابطه‌ای با **جدول واسط (junction table)** پیاده می‌شود.

> قاعده‌ی طلایی: کلید خارجی همیشه در سمت «چند» است، چون در آن سمت هیچ‌وقت بیش از یک مقدار لازم نداریم.

## ۳. خواندن Crow’s Foot

در نشانه‌گذاری Crow’s Foot سر هر رابطه با شکل‌های ساده نمایش داده می‌شود:

| نشانه | معنا |
|---|---|
| خط عمودی (bar) | یکی (one) |
| شاخه‌ی سه‌پر (crow’s foot) | چند (many) |
| دایره‌ی توخالی | اختیاری (optional / صفر-یا-بیشتر) |
| خط دوتایی | اجباری (mandatory / دقیقاً یک) |

«دقیقاً یک» یعنی سمت اجباری، و «صفر یا بیشتر» یعنی سمت اختیاری. در مثالِ درس، سمت `orders` **دقیقاً یک** مشتری دارد (اجباری)، و سمت `customers` **صفر یا چند** سفارش دارد (اختیاری).

## ۴. مثال تشریحی: مشتری و سفارش

دیاگرام مثال (بخش Example در تمرین) را ببین. ساختار آن چنین است:

- `customers(id PK, full_name, email UNIQUE NOT NULL)`
- `orders(id PK, total, customer_id FK → customers.id, NOT NULL)`
- رابطه: `customers` (one) ──── `orders` (many)، سمت orders اجباری.

معادل SQL (فقط برای مطالعه؛ در این تمرین SQL نمی‌نویسی):

```sql
CREATE TABLE customers (
  id BIGINT NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT NOT NULL AUTO_INCREMENT,
  total DECIMAL(12,2) NOT NULL,
  customer_id BIGINT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;
```

معادل Django:

```python
from django.db import models

class Customer(models.Model):
    full_name = models.CharField(max_length=120)
    email = models.EmailField(unique=True)

class Order(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT)
    total = models.DecimalField(max_digits=12, decimal_places=2)
```

`ForeignKey` سمت `Order` قرار دارد؛ یعنی سمت «چند». حالا جدول سفارش یک ستون `customer_id` دارد که نمی‌تواند NULL باشد — دقیقاً همان «اجباری» در دیاگرام.

## ۵. سه خطای رایج

**الف) گذاشتن کلید خارجی در سمت اشتباه:** اگر `orders` را در `customers` قرار دهی، برای هر مشتری باید چند شناسه سفارش ذخیره کنی که با مدل رابطه‌ای نمی‌سازد.

**ب) حمل نکردن Optionality به Schema:** اگر رابطه اجباری است ولی ستون کلید خارجی `NULL` بپذیرد، دیتابیس سفارشِ بدون مشتری را قبول می‌کند؛ در حالی که قانون دامنه آن را ممنوع کرده.

**ج) فراموش‌کردن یکتایی در کلید طبیعی:** ایمیل باید `UNIQUE` باشد، وگرنه دو مشتری با یک ایمیل ثبت می‌شوند.

## ۶. تمرین

در بخش پایین، تمرین **ERD** همین درس را انجام بده: دو جدول بساز، ستون‌ها را با نوع و کلیدها تعریف کن، رابطه‌ی یک‌به‌چند را با کلید خارجی اجباری رسم کن و طراحی را با Check Solution بسنج. قبولیِ این تمرین درس را **Completed** می‌کند.

> هیچ‌کدام از فایل‌های Starter پاسخ کامل را ندارند؛ معیارها را بخوان، خودت دیاگرام را بساز و در صورت شکست، Hint بعدی را درخواست بده.

## منابع و مطالعه بیشتر

- [MySQL Foreign Key Constraints](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html)
- [Django ForeignKey Fields](https://docs.djangoproject.com/en/6.1/ref/models/fields/#foreignkey)
