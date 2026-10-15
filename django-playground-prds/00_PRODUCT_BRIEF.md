# Django Playground — Product Brief

**نسخه:** 1.0 — MVP v0.1  
**نوع محصول:** آزمایشگاه بک‌اند شخصی و لوکال  
**مخاطب:** یک توسعه‌دهنده که می‌خواهد با نوشتن کد و مشاهده نتیجه، Django و DRF و SQLite را تجربه کند  
**وضعیت:** Ready for implementation  
**زبان UI:** فارسی، RTL؛ ادیتور کد و نمایش JSON و مسیرهای فایل LTR

## 1. مسئله و هدف

یادگیری و آزمایش Django معمولاً مستلزم راه‌اندازی دستی پروژه، ویرایش فایل‌ها، اجرای سرور، تست API و بررسی دیتابیس است. هدف محصول این است که همین چرخه در یک وب‌اپلیکیشن لوکال و ساده، با کد Python/Django واقعی داخل Docker، انجام شود.

**هدف اصلی MVP:** کاربر با `docker compose up --build` برنامه را بالا بیاورد، یک مثال Django را باز یا ایجاد کند، فایل `.py` را تغییر دهد، روی «ذخیره» و «اجرا» بزند، یک HTTP Request ارسال کند، داده SQLite را ببیند و مثال/داده را به JSON خروجی بگیرد و دوباره وارد کند.

## 2. تصمیم‌های ثابت

- کاملاً **Local-first / Single-user**؛ بدون احراز هویت، کلاد، حساب کاربری و سیستم چندکاربره.
- اجرای **واقعی Django + DRF**، نه شبیه‌سازی؛ در کانتینر مجزا از رابط وب.
- شروع با **SQLite**؛ بدون PostgreSQL، Redis، Celery یا Docker orchestration پویا.
- از روز اول، چند **مثال آماده Read-only** وجود دارد؛ کاربر می‌تواند آن‌ها را کپی کند، و مثال شخصی را بسازد/ویرایش/ذخیره/حذف/اجرا کند.
- **بدون AI، AI Tutor، Tutorial Engine، درس مرحله‌ای، امتیازدهی و آزمون.** مثال‌ها فقط نقطه شروع کدنویسی‌اند.
- Import/Export با JSON؛ «مثال» و «Dataset» دو خروجی متفاوت هستند. پشتیبانی مستقیم از فرمت واقعی Postman **جزء MVP نیست**؛ تنها رفتار شبیه Collection موردنیاز است.
- ساده‌سازی اصل معماری است. هیچ فیچری فقط برای «مقیاس‌پذیری احتمالی در آینده» ساخته نشود.

## 3. محدوده ۴ PRD

| شماره | عنوان | خروجی قابل‌مشاهده | وابستگی |
|---|---|---|---|
| 01 | Foundation & Runner | اجرای پروژه با Docker، فایل قابل ویرایش، اجرای Django و log | ندارد |
| 02 | Examples | نمونه‌های پیش‌فرض، مثال شخصی CRUD، کپی، پایداری و سوییچ | 01 |
| 03 | API & Database | API Tester، درخواست ذخیره‌شده، SQLite viewer، Migrations | 02 |
| 04 | Import & Export | JSON round-trip مثال‌ها و Datasetهای SQLite | 03 |

**قانون انتشار:** هر PRD باید با اجرای واقعی برنامه و یک سناریوی دستی قابل‌اثبات تمام شود؛ روی PRD بعدی فقط پس از پاس شدن معیارهای پذیرش قبلی کار شود.

## 4. معماری حداقلی تصمیم‌گرفته‌شده

دو سرویس در `docker-compose.yml`:

1. **`web`**: Next.js + TypeScript؛ UI و BFF (Route Handlers) برای ارتباط با runner. روی `127.0.0.1:3000` قابل مشاهده باشد.
2. **`runner`**: یک کانتینر Python با Django + DRF + FastAPI سبک برای کنترل محیط. FastAPI به‌عنوان Control API درون شبکه Docker فعال است و Django پروژه مثال را به صورت **child process** روی پورت داخلی اجرا می‌کند؛ runner درخواست API را فقط به همان Django داخلی منتقل می‌کند.

چرا FastAPI کوچک داخل همان runner؟ لازم است ویرایش فایل، شروع/توقف Django، اجرای دستورات مشخص، خواندن SQLite و درخواست HTTP از خارجِ پروسه کد تمرینی کنترل شود؛ بدون افزودن سرویس سومی یا دسترسی خطرناک وب به Docker socket. انتخاب کتابخانه با حفظ این مرز مجاز است، ولی پیچیدگی جایگزین بیشتر از این طرح نباشد.

- داده‌های کاربر در یک Docker volume پایدار مثل `/data` نگهداری شود.
- کد Built-in در Image به صورت read-only قرار بگیرد؛ کد کاربر در `/data/examples/{id}/`.
- یک Workspace/مثال **فعال در هر لحظه**؛ هر مثال دیتابیس SQLite و فایل‌های مستقل خود را دارد.
- runner **به Docker socket دسترسی ندارد** و از داخل sandbox امکان دسترسی به فایل‌های host به‌جز volume تعریف‌شده وجود ندارد.
- Control API به پورت Host publish نشود؛ UI تنها از طریق Next.js BFF به آن دسترسی دارد.
- اجرای پروژه نمونه dev-only است؛ هیچ ادعایی مبنی بر sandbox امن برای کاربران ناشناس/کد خصمانه وجود ندارد. کد خود کاربر عملاً در کانتینر محلی اجرا می‌شود.

طرح اولیه فایل‌ها:

```text
django-playground/
├── docker-compose.yml
├── README.md
├── web/                       # Next.js UI + BFF
│   ├── Dockerfile
│   └── ...
├── runner/                    # FastAPI control + Django child process
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── seeds/                 # built-in examples, read-only
│   └── ...
└── docs/                      # این PRDها پس از انتقال
```

### قراردادهای مرکزی

- مثال شخصی: `id` از نوع UUID، `name`، `description`، `createdAt`، `updatedAt`، `sourceTemplateId?`، فایل‌های پروژه، `db.sqlite3`، درخواست‌های ذخیره‌شده.
- مثال Built-in: رکورد seed با `templateId` ثابت و `readOnly: true`. تغییر مستقیم آن مجاز نیست؛ «ساخت کپی» مثال شخصی ایجاد می‌کند.
- در ذخیره فایل فقط مسیر نسبی داخل همان root مثال مجاز است؛ بررسی path traversal، symlink و extension ضروری است.
- کل فرایندهای Django از طریق runner با commandهای مشخص و بدون shell interpolation اجرا شوند.
- در تغییر مثال، اگر فایل ذخیره‌نشده هست UI تأیید بگیرد؛ مثال فعال قبلی stop شود؛ سپس مثال جدید انتخاب/اجرا شود.
- تغییر فایل **Save** است و **Run/Restart** عمل جداگانه برای دیدن تغییر در اپ؛ کاربر کنترل رفتار را داشته باشد.

## 5. UI و تجربه کاربری

- صفحه اصلی فقط یک محیط کاری با سه قسمت: **Examples sidebar**، **Editor / runner status**، **API & Database tabs**. قابلیت‌های ناتمام در فازهای قبلی پنهان باشند.
- Bootstrap: عنوان، یک دکمه Run/Stop، Save، متن خطا، بدون Dashboard پیچیده.
- فارسی RTL؛ کد، JSON، URL و log به‌صورت LTR و قابل کپی.
- حالات Loading / Error / Empty / Success برای عملیات مهم و مشخص بودن ذخیره‌نشده بودن فایل‌ها.
- عدم استفاده از UIهای نمایشی بدون عملکرد.

## 6. معیارهای نهایی موفقیت (E2E)

1. `docker compose up --build -d` موفق؛ `http://localhost:3000` پاسخ می‌دهد.
2. مثال آماده Hello API دیده می‌شود؛ از آن Copy ساخته می‌شود.
3. `views.py` ویرایش و ذخیره؛ بعد از Run، مقدار تازه در پاسخ GET نمایان می‌شود.
4. مثال CRUD انتخاب و POST ارسال می‌شود؛ پاسخ درست و رکورد تازه در SQLite Viewer دیده می‌شود.
5. مثال شخصی جدید ساخته و پس از Docker restart با کد و داده حفظ می‌شود.
6. Export مثال شخصی به JSON و Import دوباره، نمونه جدید و مستقل می‌سازد.
7. Export Dataset از مثال داده‌دار، Import به مثال سازگار (با تأیید جایگزینی)، داده را برمی‌گرداند.
8. خطای Syntax Error باعث crash پنل نمی‌شود؛ log و اقدام اصلاح دیده می‌شود.

## 7. تعاریف غیرهدف / آینده

- ترمینال کامل عمومی، اجرای فرمان arbitrary shell از UI، نصب آزادانه pip و مرور چند پروژه هم‌زمان.
- Snapshot پیچیده، Scenario Manager مستقل، نسخه‌بندی Git، جابجایی یا sync با Postman واقعی.
- ویزوالایزر Trace، Query Optimizer، گیمیفیکیشن، سیستم آموزشی و AI.
- چندکاربره، پابلیک هاست، Production-grade security، استقرار ابری، Kubernetes.

## 8. قانون جلوگیری از Overengineering

- قبل از افزودن سرویس، abstraction، state manager یا کتابخانه جدید، ضرورت آن در PRD مربوطه اثبات شود.
- یک راه‌حل قابل فهم با چند endpoint محدود از Generic Framework بزرگ بهتر است.
- UX و تست‌های مبنایی مهم‌تر از جزئیات تزئینی است.
- اگر اجرای همه قابلیت‌ها در فاز جاری گیر کرد، حداقل Vertical Slice کاربردی آن فاز را پایان بده و موارد باقی‌مانده را به طور شفاف گزارش کن؛ چیزی را به‌صورت جعلی کامل اعلام نکن.

## 9. منابع فنی مرجع

- Django admin commands / dumpdata / loaddata: https://docs.djangoproject.com/en/6.0/ref/django-admin/
- Django REST Framework: https://www.django-rest-framework.org/
- Docker Compose: https://docs.docker.com/compose/
- Postman Import/Export (صرفاً مرجع مفهوم، نه الزام سازگاری در MVP): https://learning.postman.com/docs/getting-started/importing-and-exporting/exporting-data/

> نسخه‌های دقیق پکیج‌ها باید در زمان پیاده‌سازی بر اساس سازگاری و پشتیبانی رسمی تعیین و در Lockfile ثبت شوند. کد و README منبع حقیقت اجرای پروژه هستند.
