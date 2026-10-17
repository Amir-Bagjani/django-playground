---
id: DB-03-005
slug: one-to-many
title_fa: 'ForeignKey و رابطه یک‌به‌چند: از ERD تا SQL و Django'
locale: fa-IR
version: 1
status: draft
objectives:
- بتواند رابطه یک‌به‌چند را در ERD با Cardinality و Optionality صحیح مدل کند.
- بتواند ستون FK و محدودیت Referential Integrity را در MySQL تعریف و آزمایش کند.
- بتواند ForeignKey و on_delete را در Django Model تعریف و رفتار آن را توضیح دهد.
- بتواند محدودیت متفاوت Django on_delete و قید واقعی MySQL را تشخیص دهد.
prerequisites:
- DB-00-005
- DB-01-001
- DB-03-002
exercise_ids:
- fk-practice
- fk-problem
- fk-mastery
references:
- label: Django ForeignKey Fields
  url: https://docs.djangoproject.com/en/6.1/ref/models/fields/#foreignkey
- label: MySQL Foreign Key Constraints
  url: https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html
estimated_minutes: 45
---

# ForeignKey و رابطه یک‌به‌چند

> **هدف:** بعد از این درس، بتوانی رابطهٔ «هر مشتری چند سفارش؛ هر سفارش دقیقاً متعلق به یک مشتری» را از توضیح کسب‌وکار به ERD، SQL و Django Model تبدیل کنی. تمرین‌ها را *خودت* می‌نویسی.

## ۱. مسئله واقعی و دلیل نیاز به رابطه

فرض کن اطلاعات مشتری در هر سفارش دوباره نوشته شود. تغییر شماره تماس مشتری مستلزم تغییر چندین ردیف خواهد بود؛ اگر یک ردیف جا بماند، تناقض به وجود می‌آید. جداکردن `customer` و `orders` باعث می‌شود سفارش به شناسه مشتری اشاره کند و داده شخص مستقل بماند.

**قانون دامنه:** هر سفارش باید دقیقاً یک مشتری داشته باشد؛ مشتری می‌تواند صفر یا چند سفارش داشته باشد. سمت سفارش مشارکت اجباری است، سمت مشتری اختیاری. پیش از کدنویسی این قانون را روی ERD مشخص کن.

## ۲. PK و FK، یکسان نیستند

- `customers.id` کلید اصلی است: هر مشتری را در جدول خودش یکتا مشخص می‌کند.
- `orders.customer_id` کلید خارجی است: به کلید موجود جدول مشتری ارجاع می‌دهد؛ چند سفارش می‌توانند `customer_id` مشترک داشته باشند.
- `NOT NULL` الزامی‌بودن مشتری برای سفارش را بیان می‌کند؛ `FOREIGN KEY` معتبر بودن مقدار ارجاعی را بررسی می‌کند.

## ۳. نمونه تشریحی MySQL

```sql
CREATE TABLE customers (
  id BIGINT NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;
```

برای تمرین، اول یک مشتری درج کن و سفارشی برای او بساز. سپس سفارش با `customer_id` ناموجود را امتحان کن؛ انتظار داریم دیتابیس آن را رد کند. این مثال تشریحی است و جواب تمرین‌های پایین نیست.

## ۴. بیان همان رابطه در Django

```python
from django.db import models

class Customer(models.Model):
    full_name = models.CharField(max_length=120)

class Order(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT)
    total = models.DecimalField(max_digits=12, decimal_places=2)
```

Django معمولاً نام ستون FK را `customer_id` می‌گذارد. دقت کن `on_delete=models.PROTECT` رفتار حذف را در سطح ORM کنترل می‌کند؛ لزوماً معادل مستقیم `ON DELETE RESTRICT` در SQL تولیدشده نیست. برای درک رفتار دقیق، Migration و SQL واقعی را بررسی کن.

از Django 6.1 به بعد variantهای سطح‌دیتابیس (`DB_CASCADE`، `DB_SET_NULL`، `DB_SET_DEFAULT`) هم وجود دارند و برخلاف variantهای Python، همان عمل را در خود دیتابیس انجام می‌دهند (بدون fetch کردن ردیف‌های مرتبط). دو محدودیت مهم: این variantها را نمی‌توان با variantهای Python (جز `DO_NOTHING`) در یک مدل یا مدل‌های مرتبط ترکیب کرد، و `DB_SET_DEFAULT` روی MySQL/MariaDB پشتیبانی نمی‌شود. جزئیات کامل رفتار حذف در درس DB-03-009 و گزینه‌های فیلد رابطه در DB-07-011 می‌آید.

## ۵. پارامترهایی که باید بدانی

- `on_delete`: `CASCADE`، `PROTECT`، `RESTRICT`، `SET_NULL`، `SET_DEFAULT`، `DO_NOTHING`، `SET(...)` و variantهای سطح‌دیتابیس `DB_CASCADE`/`DB_SET_NULL`/`DB_SET_DEFAULT` را با قوانین کسب‌وکار بسنج. `SET_NULL`/`DB_SET_NULL` فقط همراه `null=True` و `DB_SET_DEFAULT` فقط با `db_default` معنی دارد.
- `related_name`: نام دسترسی معکوس از مشتری به سفارش‌ها را مشخص می‌کند.
- `to_field`: به‌صورت معمول نیازی نیست؛ استفاده از یک فیلد غیر PK شرایط یکتایی لازم دارد.
- `db_constraint=False`: حذف Constraint واقعی، تضمین یکپارچگی داده در DB را ضعیف می‌کند؛ صرفاً با دلیل روشن استفاده کن.
- `null` و `blank`: یکی در سطح Schema و دیگری در سطح Validation رفتار متفاوتی دارند.

## ۶. سه خطای رایج

**الف) استفاده از `CharField` برای ذخیره شناسه مشتری:** دیتابیس نمی‌تواند Referential Integrity را فقط از روی یک رشته تضمین کند.

**ب) یکسان‌فرض‌کردن `on_delete` و `ON DELETE`:** رفتار Django را از SQL Constraint جدا بررسی کن.

**ج) افزودن رابطه بدون تعریف قانون حذف:** در سامانه‌های مالی و رزرو حذف بی‌احتیاط می‌تواند تاریخچه را از بین ببرد.

## ۷. بررسی مهندسی

اگر سفارش پس از ثبت باید از نظر تاریخی نگهداری شود، حذف مشتری چه سیاستی باید داشته باشد؟ `PROTECT`، Soft Delete یا مدل‌کردن Snapshot اطلاعات مشتری می‌توانند Trade-offهای متفاوتی داشته باشند؛ قبل از انتخاب قاعده، Business Rule را مستند کن.

## ۸. تمرین‌ها — فقط مسئله و Hint

- **Practice:** پیوند اجباری سفارش به مشتری را در Django Model بنویس.
- **Problem Solving:** رابطه اجباری را در MySQL بنویس و تست کن که Customer ناموجود پذیرفته نمی‌شود.
- **Mastery:** برای سیستم Booking تصمیم طراحی و اجرای چندمرحله‌ای با دو رابطه و سناریوی حذف ارائه کن.

> هیچ‌کدام از فایل‌های Starter پاسخ کامل را ندارند. معیارها را بخوان، خودت پیاده‌سازی کن و در صورت شکست، Hint مرحله بعد را درخواست بده.

## منابع و مطالعه بیشتر

- [Django Model Field Reference](https://docs.djangoproject.com/en/6.1/ref/models/fields/#foreignkey)
- [MySQL Foreign Key Constraints](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html)
