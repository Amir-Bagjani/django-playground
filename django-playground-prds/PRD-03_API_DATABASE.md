# PRD 03 — API Tester & SQLite Explorer

**اولویت:** P0 | **فاز:** 3 از 4 | **وابستگی:** PRD 01 و PRD 02  
**نتیجه مورد انتظار:** تست واقعی HTTP و مشاهده اثر درخواست‌ها در دیتابیس همان مثال، همراه با اجرای migration موردنیاز.

## 1. User Stories

- «می‌خواهم GET/POST/PATCH/DELETE را روی Django فعال تست کنم و Response را ببینم.»
- «می‌خواهم درخواست‌های پرتکرار را با نام ذخیره کنم و دوباره اجرا کنم.»
- «می‌خواهم جدول و رکوردهایی که API من ساخته است را در SQLite مشاهده کنم.»
- «وقتی Model را تغییر می‌دهم، بتوانم migration بسازم و اعمال کنم و log واقعی آن را ببینم.»

## 2. In Scope — API Tester

- یک پنل HTTP با انتخاب `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- مسیر relative مانند `/api/items/?limit=10`؛ **URL خارجی و هر نوع host آزاد در MVP ممنوع**. فقط درخواست به Django مثال فعال در runner.
- Headerهای دلخواه در قالب جدول key/value؛ حداقل `Content-Type`, `Authorization`، اما کنترل Hop-by-hop Header و منع جعل Host.
- Body متنی JSON برای POST/PUT/PATCH؛ بررسی JSON معتبر قبل از Send و نمایش خطا.
- نمایش status code، مدت پاسخ، response headers، response body (JSON pretty print یا text)، پیام خطا / timeout.
- درخواست‌های ذخیره‌شده برای هر مثال: Create، Rename، Update، Delete، Send، با نام و تنظیمات متد/مسیر/header/body.
- در تغییر مثال، saved requests مثال قبلی نشان داده نشوند.
- timeout مشخص (مثلاً 10 ثانیه)، سقف response نمایش (مثلاً 1 MB) و پیام قابل‌فهم؛ UI بدون spinner بی‌پایان.

## 3. In Scope — Database Explorer

- فقط **SQLite** فایل `db.sqlite3` مثال فعال، بدون اتصال به مسیر دیتابیس دلخواه Host.
- نمایش فهرست Tables، ستون‌ها و نوع داده، PK/FK در حد اطلاعات SQLite و شمارش رکوردها.
- کلیک روی Table و نمایش حداکثر 100 ردیف نخست همراه با صفحه‌بندی ساده (limit/offset)، با ستون‌بندی خوانا.
- دکمه `Refresh` برای دیدن اثر تازه API.
- حالت Empty/No Database و پیام «ابتدا Migrate را اجرا کنید» در صورت آماده نبودن DB.
- این Viewer در MVP **فقط read-only** است. ویرایش رکورد و اجرای SQL دلخواه اضافه نشود.
- همه نام جدول و پارامترهای pagination به صورت allowlist/parameterized query بررسی شوند. تزریق raw table name به SQL ممنوع.

## 4. Migration Actions

- دکمه جداگانه **Apply DB Changes** با دو دستور مشخص:
  1. `python manage.py makemigrations demo`
  2. `python manage.py migrate --noinput`
- خروجی و خطای هر دستور به ترتیب و به صورت واقعی در UI نمایش داده شود.
- بدون terminal عمومی یا فرمان کاربر آزاد.
- اگر Django در حال اجراست، runner برای جلوگیری از race در حالت تک‌کاربره آن را توقف داده، دستورات را اجرا و در پایان (در صورت موفقیت) راه‌اندازی مجدد کند؛ شکست migration باید واضح باشد.
- app آموزشی نسخه اول `demo` است؛ ایجاد appهای جدید خارج از MVP قرار دارد.
- seedهای Built-in با Migrationهای معتبر و سازگار تحویل شوند.

## 5. قرارداد API پیشنهادی

| Method | Path | نتیجه |
|---|---|---|
| POST | `/v1/runtime/request` | ورودی `{method, path, headers?, body?}`، خروجی `{status, durationMs, headers, body, contentType}` |
| GET | `/v1/requests` | درخواست‌های ذخیره‌شده متعلق به active example |
| POST | `/v1/requests` | ایجاد saved request |
| PATCH | `/v1/requests/{id}` | ویرایش saved request |
| DELETE | `/v1/requests/{id}` | حذف saved request |
| GET | `/v1/database/tables` | فهرست جدول‌های example DB |
| GET | `/v1/database/tables/{name}` | ستون‌ها، نوع، PK/FK، count |
| GET | `/v1/database/tables/{name}/rows?limit=50&offset=0` | rows و pagination |
| POST | `/v1/database/migrate` | اجرای مرحله‌به‌مرحله makemigrations + migrate و log |

- برای درخواست HTTP، runner تنها `127.0.0.1:8001` داخل کانتینر را هدف بگیرد؛ external destination, redirects to external hosts و SSRF رد شوند.
- Headerهای انتقالی ناامن حذف شوند؛ پاسخ خطاها حتی در 4xx/5xx همراه status واقعی نشان داده شود.
- logهای خطای user code از runner جدا از خطاهای کنترل پنل مدیریت شود.

## 6. UX پیشنهادی

- کنار ادیتور یک قسمت Tabدار: `API` و `Database` (در موبایل/عرض کم، زیر ادیتور).
- `API`: سطر متد/مسیر/Send، Header/Body، JSON Response، Saved Requests.
- `Database`: نام جدول، شمارش رکورد، نمایش ردیف‌ها و دکمه Refresh و Apply DB Changes.
- نمایش جداگانه «API Server Stopped» و راهنمای Run به جای خطای مبهم Network Error.
- نوار UI ساده و کاربردی، بدون نمودار و ابزارهای تشخیصی سنگین.

## 7. Acceptance Criteria

1. انتخاب Built-in CRUD از طریق Copy و Run؛ GET لیست پاسخ درست بدهد.
2. POST یک Item جدید ایجاد کند؛ Database Viewer بعد از Refresh رکورد را نمایش دهد.
3. PATCH مقدار رکورد را تغییر دهد و DELETE آن را حذف کند؛ اثر در Viewer دیده شود.
4. هنگام دریافت Validation Error، status واقعی 400 و JSON خطا دیده شود.
5. یک request ذخیره و بعد از Refresh صفحه و Restart کانتینر بازیابی شود.
6. درخواست‌های ذخیره‌شده در دو مثال مستقل باشند.
7. تغییر Model و اجرای Apply DB Changes، migration واقعی را ایجاد و اعمال کند؛ ستون جدید در Viewer دیده شود.
8. جدول‌های نامعتبر یا پارامترهای مخرب SQL رد شوند؛ Viewer نتواند جدول‌های خارج از DB نمونه انتخاب کند.
9. درخواست خارجی مثل `https://example.com` رد شود؛ server error موجب crash web نشود.
10. درخواست timeout با پایان قطعی loading و پیام Retry مدیریت شود.

## 8. Out of Scope

- سازگاری Export/Import مستقیم با Postman؛ JSON collection خودمان در PRD 04.
- Multipart files، GraphQL، WebSockets، SSE، OAuth flows، API documentation generator.
- SQL Editor و تغییر دستی row، PostgreSQL و Performance Profiler.

## 9. تست / تحویل

- تست API client برای هر پنج متد و خطا، توقف server، timeout، header filtering، URL injection.
- تست read-only SQLite metadata و pagination و Refresh بعد از mutation.
- integration تست migrate مدل تازه و failure recovery.
- Demo واقعی: POST item، مشاهده در SQLite، PATCH، مشاهده تغییر و DELETE.
