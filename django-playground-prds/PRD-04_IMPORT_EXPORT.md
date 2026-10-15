# PRD 04 — JSON Import / Export (Examples + Datasets)

**اولویت:** P0 | **فاز:** 4 از 4 | **وابستگی:** PRD 01 تا 03  
**نتیجه مورد انتظار:** کاربر بتواند مثال شخصی و داده‌های نمونه را به JSON خروجی بگیرد و بعداً به‌طور مطمئن دوباره وارد کند.

## 1. User Stories

- «یک مثال Django همراه با سورس و درخواست‌های API ساخته‌ام و می‌خواهم JSON آن را نگه دارم.»
- «می‌خواهم همان فایل JSON را Import کنم تا **مثال جدید مستقل** ساخته شود، نه اینکه مثال قبلی overwrite شود.»
- «می‌خواهم داده‌های نمونه‌ام را جداگانه Export کنم و در مثالی با Schema سازگار بازگردانم.»

## 2. دو نوع فایل، کاملاً مستقل

### A) Example JSON

- شامل `format`, `version`, `metadata`, `files`, `requests` و در صورت انتخاب کاربر `dataset`.
- **Export** روی مثال شخصی و در صورت نیاز Built-in (بدون ایجاد تغییر در seed) امکان‌پذیر است.
- import همواره یک **My Example با UUID جدید** می‌سازد؛ هیچ نمونه‌ای درجا جایگزین نشود.
- همه مسیر فایل‌ها relative و در ریشه project محدود باشند. فقط فایل‌های متنی مجاز؛ `__pycache__`، `.env`، `db.sqlite3` باینری و فایل‌های حساس شناخته‌شده وارد خروجی نشوند. **تشخیص خودکار همه secretهای احتمالی در سورس Python تضمین‌پذیر نیست**؛ پیش از دانلود هشدار واضح نمایش داده شود که کاربر سورس صادراتی را بازبینی کند.
- اگر کاربر Dataset را هم همراه Example می‌خواهد، خروجی Fixture JSON از app `demo` به صورت فیلد `dataset.records` افزوده شود (اختیاری).
- درخواست‌های ذخیره‌شده API داخل `requests` بیایند؛ payload باید بدون credential حساس باشد؛ مقادیر Authorization و headerهای حساس به طور پیش‌فرض **حذف/ماسک** شوند و UI صراحتاً این را اعلام کند.
- Import باید format/version/shape، مسیرها، اندازه، نام فایل‌ها و نوع values را validate کند؛ تا قبل از اعتبارسنجی هیچ نمونه نیمه‌کاره ایجاد نشود.
- فایل واردشده می‌تواند Python خطادار داشته باشد؛ import باید آن را به عنوان سورس ذخیره و هنگام Run خطای واقعی نشان دهد، نه اینکه مخفیانه کد را اصلاح کند.

نمونه ساختار پیشنهادی (نمونه، نه payload کامل):

```json
{
  "format": "django-playground.example",
  "version": 1,
  "metadata": {
    "name": "Items CRUD",
    "description": "My API experiment"
  },
  "files": {
    "manage.py": "...source...",
    "demo/views.py": "...source...",
    "demo/models.py": "...source..."
  },
  "requests": [
    {"name": "List Items", "method": "GET", "path": "/api/items/", "headers": {}, "body": null}
  ],
  "dataset": {
    "format": "django-fixture",
    "records": [
      {"model":"demo.item", "pk":1, "fields":{"name":"Sample"}}
    ]
  }
}
```

**Import/Snapshot فایل‌ها:** برای Import، فهرست فایل‌های ضروری Django باید کامل باشد؛ Payloadهای Export شده توسط خود برنامه round-trip شوند. هنگام Import، فقط project fileهای مجاز ساخته شوند و SQLite جدید ایجاد شود. اگر dataset همراه است، بعد از `migrate`، Fixture import و خطاها گزارش شوند. import باید fail-safe باشد: نمونه ناموفق به‌صورت ناقص در لیست فعال رها نشود.

### B) Dataset JSON

- Export از **app `demo`** مثال فعال با Fixture استاندارد Django (`dumpdata demo --format json --indent 2` یا معادل سازگار).
- داده‌های application tables صادر شوند؛ داده `auth`, `sessions`، secrets یا فایل‌های باینری صادر نشوند.
- خروجی با wrapper ساده `{format:"django-playground.dataset", version:1, sourceApp:"demo", records:[...]}` نگهداری شود؛ `records` برابر fixture استاندارد Django است.
- Import فقط برای مثالی با app و migrationهای سازگار مجاز است.
- **MVP فقط حالت Replace Dataset** دارد؛ Merge، حل تعارض PK و diff پیشرفته نداریم.
- پیش از Replace تأیید صریح بگیرد و در پنل هشدار دهد که داده‌های فعلی app حذف/جایگزین می‌شوند.
- هنگام Import، Django runtime متوقف شود؛ از SQLite پیش از عملیات backup موقت گرفته شود؛ روی دیتابیس تازه با `PLAYGROUND_DB_PATH` کنترل‌شده migration و loaddata اجرا و در صورت موفقیت دیتابیس جایگزین شود؛ در صورت خطا بک‌آپ بازیابی/DB قبلی دست‌نخورده بماند.
- Schema mismatch یا رکورد نامعتبر باید خطای واضح بدهد؛ اعلام Import موفق در صورت failure ممنوع است.
- پس از موفقیت، Database Viewer refresh شود و دوباره Run امکان‌پذیر باشد.

## 3. جریان کار UI

1. داخل مثال شخصی دو دکمه مشخص `Export Example` و `Export Dataset` وجود دارد.
2. Export Example یک انتخاب کوچک دارد: `Include current dataset` (پیش‌فرض خاموش)؛ دانلود JSON در مرورگر انجام شود.
3. `Import Example` یک JSON انتخاب می‌کند، Preview نام/توضیح/تعداد فایل‌ها و Requestها را نشان می‌دهد و با تأیید **مثال جدید** می‌سازد.
4. `Import Dataset` در مثال فعال JSON را می‌گیرد، تعداد رکوردها/نام Modelها را برای Preview نشان می‌دهد، هشدار Replace می‌دهد و فقط با تأیید اعمال می‌کند.
5. در هر شکست error قابل‌فهم + جزئیات فنی قابل نمایش؛ UI به وضعیت پایدار برگردد.

## 4. API پیشنهادی

| Method | Path | رفتار |
|---|---|---|
| GET | `/v1/examples/{id}/export?includeDataset=false` | فایل JSON ساختار Example |
| POST | `/v1/examples/import` | پذیرش/اعتبارسنجی JSON، ایجاد custom example جدید |
| GET | `/v1/examples/{id}/dataset/export` | dataset JSON از app `demo` |
| POST | `/v1/examples/{id}/dataset/preview` | اعتبارسنجی اولیه و شمارش/نام Modelها |
| POST | `/v1/examples/{id}/dataset/replace` | replace تاییدشده با backup/rollback |

- محدودیت اندازه فایل import تعریف شود (مثلاً 5MB)؛ پیام خطا در UI باشد.
- Server درخواست را با validate دقیق قبول کند؛ کنترل‌های UI به تنهایی کافی نیستند.
- API contract می‌تواند به‌صورت multipart upload یا JSON body باشد؛ یکی را انتخاب و در README مستند کنید، نیازی به هر دو نیست.

## 5. Acceptance Criteria

1. Export و Import یک مثال شامل `views.py`، `models.py`، `urls.py` و یک saved request، مثال جدید با فایل/درخواست یکسان و ID جدید بسازد.
2. مثال اولیه پس از Import هیچ تغییری نکند.
3. خروجی فایل بتواند به صورت یک JSON واحد دانلود و دوباره بارگذاری شود.
4. Header Authorization در export به‌صورت پیش‌فرض حذف/ماسک شود و UI آن را توضیح دهد.
5. Dataset دارای ۳ رکورد Export شود؛ پس از تغییر/حذف داده‌ها، Import Replace تعداد و مقادیر را برگرداند.
6. Dataset با schema ناسازگار باعث خطا شود و دیتابیس قبلی حذف/خراب نشود.
7. فایل JSON خراب، version ناسازگار، payload خیلی بزرگ و path traversal بدون side effect رد شوند.
8. Import مثال دارای Python خطادار ذخیره شود، ولی اجرای آن خطای واقعی قابل فهم بدهد.
9. فایل داده‌ها بعد از restart کانتینر همچنان قابل دسترسی باشد.

## 6. Out of Scope

- Export کل پروژه به ZIP، snapshotهای چندنسخه‌ای و سیستم Scenario Manager.
- Import/Export سازگار کامل با Postman Collection schema؛ در نسخه بعدی ارزیابی شود.
- Data Merge هوشمند، حل تعارض، ابزار انتقال PostgreSQL، Import فایل Excel/CSV.

## 7. تست‌ها و تحویل

- تست round-trip مثال همراه درخواست‌ها و فایل‌های واقعی.
- تست Dataset round-trip با چند foreign key درون app `demo`.
- تست malicious path، corrupted JSON، invalid version، schema mismatch و rollback.
- Smoke end-to-end: Run > POST > DB View > Export Example with Dataset > Import > Run > DB View.

**مبنای فنی:** Django `dumpdata` و `loaddata` ابزار رسمی JSON fixtures هستند: https://docs.djangoproject.com/en/6.0/ref/django-admin/ . ساختار Postman الهام‌بخش است ولی سازگاری با آن در این فاز تعهد نشده است.
