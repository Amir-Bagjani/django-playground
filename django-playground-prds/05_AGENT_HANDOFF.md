# Agent Handoff — دستور پیاده‌سازی Django Playground

## هدف

این فولدر حاوی Product Brief و چهار PRD ترتیبی برای یک **محصول شخصی لوکال** است. هدف ایجاد یک MVP **واقعاً قابل اجرا و تست** است، نه نوشتن معماری یا Prototype نمایشی.

## ترتیب مطالعه

1. `00_PRODUCT_BRIEF.md` — قواعد محصول و محدودیت‌ها
2. `PRD-01_FOUNDATION_RUNNER.md`
3. `PRD-02_EXAMPLES.md`
4. `PRD-03_API_DATABASE.md`
5. `PRD-04_IMPORT_EXPORT.md`

## دستور اصلی برای ایجنت (قابل کپی)

> تو مسئول پیاده‌سازی MVP پروژه Django Playground هستی. ابتدا فایل‌های PRD را به ترتیب بالا بخوان. محصول را ساده، Local-first، بدون AI و بدون Tutorial بساز. اجرای واقعی Django در کانتینر ایزوله Docker ضروری است. **فقط PRD 01 را در فاز اول** پیاده‌سازی کن؛ تا وقتی Docker Compose اجرا، ویرایش و ذخیره کد، Run/Stop، تست endpoint و مشاهده خطاها واقعاً موفق نشده، وارد PRD 02 نشو. پس از پایان هر فاز تست‌های تعریف‌شده را اجرا، خطاها را اصلاح، README را به‌روز و گزارشی کوتاه از فیچرهای تحویل‌شده، تست‌ها و موارد انجام‌نشده ارائه کن. اگر در محیطت دسترسی Docker نداری، دقیق اعلام کن چه تست‌هایی را نتوانستی اجرا کنی و از اعلام موفقیت ساختگی خودداری کن. معماری را بزرگ نکن، سرویس سوم یا زیرساخت کلاد اضافه نکن و ویژگی خارج از PRD نساز. بعد از تأیید فاز اول، PRDهای بعدی را به ترتیب انجام بده.

## قواعد اجرایی

- اول یک **vertical slice کوچک** کامل؛ توسعه مرحله‌ای، نه implementation هم‌زمان چند PRD.
- با stack موجود repository سازگار باش؛ اگر repo خالی است از طراحی دو سرویس ذکر شده استفاده کن. انتخاب نسخه‌های package پس از بررسی سازگاری و pin/lock انجام شود.
- برای فازها branch و commit کوچکِ معنادار مفید است؛ اما در کدهای موجود user را بدون اجازه overwrite نکن و `git reset --hard` نزن.
- No AI, no lesson engine, no account system, no Postgres/Redis/Celery, no Kubernetes.
- از ساده‌ترین UI قابل استفاده شروع کن؛ responsive پایه و RTL با کد LTR مهم است؛ دیزاین سیستم اختصاصی بزرگ نساز.
- همه logها و خطاهای مهم باید در خود برنامه یا README واضح باشند؛ Loading بدون انتها پذیرفته نیست.
- حفظ داده در Restart یک شرط اصلی است؛ پاک کردن volume به عنوان راه‌حل باگ ممنوع.
- Built-in read-only و My Examples editable؛ یک مثال فعال هم‌زمان.
- Runtime و test responses باید **واقعی** باشند، بدون fake/mock نمایشگر.

## قالب گزارش پس از هر PRD

```text
PRD: 01 / Foundation
Status: Complete | Partial | Blocked
Implemented:
- ...
Manual test:
- command: ...
- result: ...
Automated tests:
- command: ...
- passed/failed: ...
Known limitations:
- ...
Files changed:
- ...
Next suggested step:
- ...
```

## Definition of project completion

- تمامی PRDها با تست یا demo واقعی پذیرفته شده باشند.
- `docker compose up --build` روی دستگاه لوکال بتواند سرویس‌ها را اجرا کند.
- مسیر E2E در Product Brief به طور کامل کار کند.
- هیچ قابلیت AI یا سیستم آموزش هدایت‌شده‌ای در کد وارد نشده باشد.

## تصمیم در صورت ابهام

انتخاب پیش‌فرض **راه‌حل ساده‌تر و قابل‌ساخت** است. اگر تصمیمی با یکی از اهداف مرکزی (Local-only، ایزولاسیون runner، پایداری داده، JSON round-trip یا عدم وجود AI) تعارض دارد، آن را به‌صراحت در گزارش بنویس و از تغییر بی‌اجازه این قواعد خودداری کن.
