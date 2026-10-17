---
id: DB-00-008
slug: first-query
title_fa: 'اولین SELECT و QuerySet: خواندن داده از جدول'
locale: fa-IR
version: 1
status: approved
objectives:
- بتواند با SELECT ستون‌های موردنیاز را از یک جدول انتخاب کند.
- بتواند با WHERE، ORDER BY و LIMIT مجموعه نتیجه را کنترل کند.
- بتواند همان نتیجه را با QuerySet، filter و order_by در Django بسازد.
- تفاوت ارزیابی تنبل QuerySet با اجرای فوری SQL را توضیح دهد.
prerequisites:
- DB-00-005
- DB-00-006
- DB-00-007
exercise_ids:
- first-query-sql
- first-query-orm
references:
- label: Django QuerySet API (filter, order_by, values)
  url: https://docs.djangoproject.com/en/6.1/ref/models/querysets/
- label: MySQL SELECT Statement
  url: https://dev.mysql.com/doc/refman/8.4/en/select.html
estimated_minutes: 30
---

# اولین SELECT و QuerySet

> **هدف:** بعد از این درس می‌توانی یک «سؤال از داده» را به یک دستور `SELECT` و به یک QuerySet معادل تبدیل کنی، نتیجه را روی جدول واقعی اجرا کنی و بفهمی چرا Django همه‌ی کوئری‌ها را همان لحظه اجرا نمی‌کند. تمرین‌ها را *خودت* می‌نویسی.

## ۱. مسئله واقعی

تا اینجا یاد گرفتیم داده در جدول ذخیره می‌شود و کلید، هر سطر را یکتا می‌کند. اما کار روزمره‌ی ما «خواندن» است: «چه کتاب‌هایی موجودند و ارزان‌ترین کدام است؟» نوشتن کل جدول روی صفحه راه‌حل نیست؛ باید مشخص کنیم **کدام ستون‌ها** و **کدام سطرها** و **با چه ترتیبی** برگردند.

همان سه تصمیم در SQL و در ORM تکرار می‌شود:

- انتخاب ستون (Projection): فقط `title, price`.
- فیلتر سطرها (Selection): فقط کتاب‌های منتشرشده.
- ترتیب نتیجه (Ordering): ارزان‌ترین به گران‌ترین یا برعکس.

## ۲. جدول نمونه‌ی این درس

برای آموزش از جدول `books` استفاده می‌کنیم (جدول تمرین‌های شما جدول دیگری است و همان‌جا توضیح داده می‌شود).

```sql
CREATE TABLE books (
  id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  published TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
);
```

تصور کن این داده‌ها درج شده‌اند: `Learning SQL` با قیمت `29.90`، `Django By Example` با قیمت `45.00` و `Old Draft` با قیمت `9.00` که `published = 0` است.

## ۳. همان سؤال در SQL

می‌خواهیم کتاب‌های منتشرشده را با عنوان و قیمت، از گران به ارزان ببینیم:

```sql
SELECT title, price
FROM books
WHERE published = 1
ORDER BY price DESC;
```

- `SELECT title, price` می‌گوید دقیقاً کدام ستون‌ها برگردند؛ `SELECT *` در کد واقعی کمتر استفاده می‌شود چون داده‌ی بی‌مصرف می‌آورد.
- `WHERE published = 1` سطرهای نامربوط را حذف می‌کند.
- `ORDER BY price DESC` ترتیب را نزولی می‌کند؛ بدون آن، ترتیب نتیجه تضمین‌شده نیست.

نتیجه چیزی شبیه این است: `Django By Example | 45.00` و بعد `Learning SQL | 29.90`. دقت کن `Old Draft` چون `published = 0` است اصلاً برنگشت.

## ۴. همان سؤال در Django ORM

اگر مدل `Book` را داشته باشیم، همان سه تصمیم با QuerySet نوشته می‌شوند:

```python
Book.objects.filter(published=True).order_by("-price").values("title", "price")
```

- `Book.objects` نقطه‌ی ورود کوئری روی مدل است.
- `.filter(published=True)` متناظر `WHERE` است.
- `.order_by("-price")` متناظر `ORDER BY ... DESC` است؛ علامت منفی یعنی نزولی.
- `.values("title", "price")` یعنی به‌جای شیء کامل، فقط این دو ستون برگردند — نزدیک‌ترین معادل `SELECT title, price`.

## ۵. تفاوت مهم SQL و ORM: ارزیابی تنبل

این بخش جایی است که خیلی‌ها اشتباه می‌کنند. در SQL، به‌محض ارسال دستور، دیتابیس اجرا می‌کند. در ORM اما یک QuerySet **تنبل (lazy)** است:

```python
queryset = Book.objects.filter(published=True).order_by("-price")
print(queryset.query)     # فقط کوئری ساخته شده؛ هنوز به دیتابیس نرفته است
rows = list(queryset)     # همین لحظه واقعاً اجرا می‌شود
```

تا وقتی نتیجه را مصرف نکنی (`list()`، حلقه `for`، `len()`، سریالایز کردن)، Django کوئری را به دیتابیس نمی‌فرستد. نتیجه‌ی عملی: می‌توانی QuerySet را پشت‌سرهم بسازی و ادامه بدهی، اما «اجرا شد یا نه» را نباید حدس بزنی — برای دیدن SQL نهایی از `str(queryset.query)` استفاده کن.

نکته‌ی مرزی: SQL و ORM در این درس معادلِ رفتاری‌اند، ولی همیشه یکی نیستند. ویژگی‌هایی مثل برخی توابع پنجره‌ای یا دستورات مدیریتی در ORM معادل مستقیم ندارند و باید با `raw()` یا SQL دستی نوشته شوند.

## ۶. محدودکردن حجم نتیجه

برای دیدن چند سطر اول، در SQL از `LIMIT` استفاده می‌کنیم:

```sql
SELECT title, price FROM books WHERE published = 1 ORDER BY price DESC LIMIT 2;
```

در ORM معادل آن برش (Slicing) است؛ نه یک متد جدا:

```python
Book.objects.filter(published=True).order_by("-price").values("title", "price")[:2]
```

## ۷. سه خطای رایج

**الف) فراموش‌کردن `WHERE`:** نتیجه به‌جای «کتاب‌های منتشرشده» می‌شود «همه‌ی کتاب‌ها». خیلی از خطاهای منطقی از همین‌جا شروع می‌شود.

**ب) فراموش‌کردن `ORDER BY`:** دیتابیس هیچ ترتیبی را تضمین نمی‌کند. اگر ترتیب مهم است، باید صریح بنویسی؛ در ORM هم `.order_by()` را جا نینداز.

**ج) مقایسه‌ی `NULL` با `=`:** `WHERE price = NULL` هرگز درست کار نمی‌کند؛ باید `IS NULL` نوشت. جزئیات این رفتار در درس `DB-00-009` می‌آید.

## ۸. تمرین‌ها

دو تمرین پایین همین صفحه را باز کن. هر دو روی یک جدول واقعی اجرا می‌شوند:

- **تمرین SQL:** جدول `products` را با `SELECT` می‌خوانی؛ باید فقط محصولات موجود را با دو ستون و ترتیب مشخص برگردانی.
- **تمرین ORM:** همان نتیجه را با QuerySet می‌سازی و در متغیر `result` می‌گذاری.

معیار قبولی هر تمرین زیر ویرایشگر نوشته شده است. `Execute` فقط نتیجه‌ی خام را نشان می‌دهد؛ `Check Solution` معیارها را می‌سنجد. توجه: اجرای بدون خطا به‌معنای درست‌بودن جواب نیست — ممکن است کوئری اجرا شود ولی سطرهای اشتباه برگرداند.

> Starter هر تمرین یک اسکلت ناقص است و **پاسخ کامل ندارد**. اول خودت بنویس، بعد Check کن؛ اگر شکست خورد، Hint بخواه.

## منابع و مطالعه بیشتر

- [Django QuerySet API](https://docs.djangoproject.com/en/6.1/ref/models/querysets/)
- [MySQL SELECT Statement](https://dev.mysql.com/doc/refman/8.4/en/select.html)
