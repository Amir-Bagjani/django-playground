# PRD 02 — Built-in & Custom Examples Management

**اولویت:** P0 | **فاز:** 2 از 4 | **وابستگی:** PRD 01 کامل و قابل اجرا  
**نتیجه مورد انتظار:** کتابخانه مثال آماده + ساخت، کپی، ویرایش، ذخیره، حذف، انتخاب و اجرای مثال‌های شخصی.

## 1. User Stories

- «وقتی Playground را باز می‌کنم، چند مثال آماده Django می‌خواهم.»
- «می‌خواهم یک مثال خالی یا کپی از مثال آماده بسازم، به آن اسم و توضیح بدهم و کدش را ویرایش کنم.»
- «می‌خواهم مثال شخصی من با دیتابیس و فایل‌هایش بعد از Refresh و Restart همان‌طور باقی بماند.»
- «می‌خواهم بین مثال‌ها جابه‌جا شوم و داده‌هایشان قاطی نشود.»

## 2. دامنه

### Built-in Examples (حداقل ۳ مورد)

1. **Hello World API:** مسیر `GET /api/hello/` و یک JSON ساده.
2. **Models & ORM:** یک Model کوچک در app ثابت `demo`، migration اولیه و چند رکورد نمونه (با README کوتاه برای توضیح هدف، نه tutorial).
3. **CRUD API:** مدل `Item` و endpointهای GET list/detail، POST، PATCH و DELETE با DRF؛ migrations آماده.

- نمونه‌های Built-in از seedهای نسخه‌دارِ همراه Source Code بارگذاری شوند.
- Built-in **مستقیماً قابل ویرایش نیست**؛ کاربر دکمه «Copy to My Examples» دارد.
- اگر seed در نسخه جدید تغییر کرد، فایل‌های شخصی یا کپی‌ها هرگز overwrite نشوند.

### My Examples

- **Create:** اسم لازم، توضیح اختیاری، بر مبنای Scratch blank template یا copy از Built-in.
- **Read:** لیست مثال‌ها و بازکردن هر مثال؛ تفکیک Built-in و My Examples.
- **Update:** تغییر نام/توضیح، ویرایش/Save فایل‌های مرتبط با مثال شخصی.
- **Delete:** فقط برای My Examples، با تأیید مشخص و هشدار حذف سورس، داده SQLite و درخواست‌های ذخیره‌شده؛ حذف Built-in ممنوع.
- **Run:** بازکردن مثال شخصی، Run/Restart مطابق PRD 01.
- **Duplicate:** از هر مثال Built-in یا شخصی یک مثال مستقل با ID جدید، کپی سورس و در حالت شخصی کپی دیتابیس مستقل. داده منبع نباید با مقصد shared یا linked باشد.
- **Switch:** توقف مثال قبلی و شروع/انتخاب مثال جدید، با handling ذخیره‌نشده‌ها.
- **Persistence:** بعد از `docker compose restart` مثال‌ها، فایل‌ها، metadata و SQLite باقی بمانند.

## 3. رفتار ساده و قابل پیش‌بینی

- در هر لحظه فقط **یک مثال فعال** داریم. اجرای هم‌زمان چند مثال در این نسخه ممنوع است.
- UI sidebar: بخش Built-in، بخش My Examples، دکمه `+ New Example`، منوی Rename/Duplicate/Delete برای شخصی، و دکمه Run.
- ورود به Built-in پیش‌نمایش read-only نمایش دهد؛ دکمه «Try / Run this example» به طور خودکار یک **کپی شخصی مستقل** می‌سازد و آن را اجرا می‌کند. دکمه «Create a copy» هم می‌تواند جدا باشد. کاربر نمی‌تواند نمونه اصلی را خراب کند.
- از PRD 01، Scratch می‌تواند اولین مثال شخصی باشد؛ در Migration داده‌های قبلی Scratch حفظ شود.
- تغییر انتخاب با فایل unsaved: «Save»، «Discard»، «Cancel». هیچ تغییر ذخیره‌شده‌ای نباید بی‌خبر از بین برود.
- تغییر مثال «Save» و «Run» را با هم اشتباه نکند. اجرای مثال جدید در صورت موفقیت پنل و Status را به نمونه جدید bind کند.
- حذف مثال فعال ابتدا runner را stop کند، سپس حذف کند و یک مثال دیگر را انتخاب کند.
- نمایش خطاهای فایلی به شکل قابل‌فهم؛ نام تکراری مجاز است اما ID یکتا است.

## 4. ساختار ذخیره‌سازی حداقلی

```text
/data/
├── state.json                         # activeExampleId
└── examples/
    └── <uuid>/
        ├── metadata.json              # id, name, description, timestamps, sourceTemplateId
        ├── project/
        │   ├── manage.py
        │   ├── config/
        │   ├── demo/
        │   └── db.sqlite3
        └── requests.json              # PRD 03

/app/seeds/                             # Built-in immutable templates
├── hello/
├── orm/
└── crud/
```

- فایل‌سیستم + JSON metadata کافی است؛ دیتابیس مرکزی برای metadata نسازیم.
- ذخیره JSON metadata با روش atomic write؛ هنگام crash فایل metadata نیمه‌کاره ایجاد نشود.
- صرفاً project files مجاز مربوط به نمونه copy شوند؛ `__pycache__`، فایل موقت و secrets خارج از نمونه‌ها منتقل نشوند.
- حذف فایل‌ها و Validation مسیر از PRD 01 تبعیت می‌کند.

## 5. Control API پیشنهادی

| Method | Path | توضیح |
|---|---|---|
| GET | `/v1/examples` | آرایه Built-in و My Examples + readOnly و ID |
| POST | `/v1/examples` | `{name, description?, fromTemplateId?}`؛ ایجاد مثال شخصی |
| GET | `/v1/examples/{id}` | Metadata و active status |
| PATCH | `/v1/examples/{id}` | Rename/description؛ شخصی فقط |
| DELETE | `/v1/examples/{id}` | حذف مثال شخصی، بعد از confirmation UI |
| POST | `/v1/examples/{id}/duplicate` | کپی مستقلِ فایل و DB |
| POST | `/v1/examples/{id}/activate` | Stop قبلی، انتخاب جدید و status؛ Run می‌تواند جدا باشد |

فایل و runtime endpoints فاز ۱ باید روی **active personal example** عمل کنند و فراتر از آن مسیر دسترسی نداشته باشند؛ به Built-in نوشتن مجاز نیست.

## 6. معیارهای پذیرش (Acceptance Criteria)

1. سه Built-in در اولین اجرا بدون نیاز به تنظیم دستی دیده شوند.
2. ویرایش Built-in رد شود؛ با Copy یک مثال جدید شخصی ساخته شود که ویرایش آن مجاز است.
3. Create خالی، Rename، Duplicate و Delete با UI کار کنند.
4. دو مثال شخصی بتوانند پاسخ API و محتوای `views.py` متفاوت داشته باشند.
5. هر مثال SQLite مختص خودش داشته باشد و تغییر آن در مثال دیگر دیده نشود.
6. اگر Example A فعال است و به B سوییچ می‌کنیم، دیگر درخواست‌ها به A ارسال نشوند.
7. Save و Run روی مثال شخصی بعد از Refresh و restart کانتینر باقی بماند.
8. حذف Built-in توسط API ممنوع، و حذف Custom با ID نامعتبر خطای کنترل‌شده بدهد.
9. خطاهای switching یا bad code موجب از دست رفتن Metadata و فایل مثال قبلی نشوند.

## 7. خارج از محدوده

- جستجوی پیشرفته، tagging، پوشه‌های تو در تو، version history، Git، چند کاربر.
- ایجاد App جدید Django از طریق UI یا نصب آزاد package؛ همه نمونه‌های فاز اول با app اصلی `demo` کار می‌کنند.
- انتقال نمونه به کامپیوتر دیگر؛ در PRD 04.

## 8. تست‌ها / تحویل

- CRUD نمونه شخصی؛ CRUD Built-in باید دست‌نخورده بماند.
- integration switch، independent DB، duplicate، reload/restart persistence.
- تست نام خالی، ID نامعتبر، حذف مثال فعال، rename و unsaved change.
- یک demo: ساخت «My Expenses API» از Blank، edit views، Run؛ duplicate و rename و delete مستقل.
- README روش استفاده و محدودیت «یک مثال فعال» را ذکر کند.
