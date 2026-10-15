# PRD 01 — Foundation & Django Runner

**اولویت:** P0 | **فاز:** 1 از 4 | **وابستگی:** ندارد  
**نتیجه مورد انتظار:** کاربر با Docker Compose برنامه را اجرا، کد Django را ویرایش و ذخیره، و سرور را Run/Stop کند و خروجی و خطا را ببیند.

## 1. Problem / User Story

«می‌خواهم بدون ساخت دستی محیط Python، یک کد واقعی Django را در مرورگر تغییر دهم، اجرا کنم و نتیجه را ببینم.»

## 2. محدوده In Scope

1. Monorepo کوچک با `web/` (Next.js، TypeScript) و `runner/` (Python؛ FastAPI Control API و Django+DRF child process).
2. یک `docker-compose.yml` با فقط دو سرویس `web` و `runner`، Healthcheck مناسب و volume پایدار برای `/data`.
3. پنل وب فارسی RTL در `http://localhost:3000` با یک Workspace اولیه به نام **Scratch**.
4. پروژه نمونه Django واقعی با `manage.py`، `config/urls.py`، `config/settings.py`، `demo/views.py` و `demo/models.py`، endpoint پیش‌فرض `GET /api/hello/` با JSON.
5. فهرست فایل‌های موجود (در حد tree ساده)، بازکردن فایل‌های متنی مجاز، ویرایش متن، نمایش تغییرات ذخیره‌نشده و دکمه **Save**.
6. دکمه **Run / Restart** و **Stop**، وضعیت `stopped / starting / running / error` و نمایش log اخیر سرور و خطاهای Python.
7. یک دکمه **Open / Test Hello API** که درخواست GET به مسیر نمونه ارسال کند و status و response را نمایش دهد. API Tester کامل در PRD 03 است.
8. Persist شدن سورس پروژه Scratch در volume؛ پس از restart کانتینر، تغییر کد باقی بماند.
9. فایل README با یک دستور راه‌اندازی، URL، نحوه stop و پاک‌کردن عمدی داده‌ها.

## 3. جریان کار

1. کاربر `docker compose up --build` را اجرا می‌کند و پنل را باز می‌کند.
2. فایل `demo/views.py` باز می‌شود؛ مقدار `"Hello!"` را تغییر می‌دهد.
3. «Save» می‌زند؛ Save موفق و وضعیت unsaved پاک می‌شود.
4. «Run» می‌زند؛ پروژه Django با Python واقعی اجرا می‌شود. logهای startup نشان داده می‌شود.
5. «Test Hello API» را می‌زند؛ JSON جدید برمی‌گردد.
6. با وارد کردن Python نامعتبر، «Run» خطای SyntaxError را در UI نشان می‌دهد و صفحه همچنان کار می‌کند.
7. کد را اصلاح می‌کند، دوباره Save + Run می‌زند و پاسخ درست دریافت می‌کند.

## 4. قرارداد اجرای حداقلی

- `runner` یک پروسه کنترل HTTP دارد و Django را **در child subprocess** داخل همان کانتینر و روی `127.0.0.1:8001` بالا می‌آورد؛ UI کد تمرینی را در فرایند خودش execute نمی‌کند.
- Control API فقط روی Docker network بین دو سرویس در دسترس است؛ port آن در host منتشر نشود.
- Next.js BFF درخواست‌های UI را به runner می‌فرستد؛ URL/port داخلی runner به مرورگر نشان داده نشود.
- Python process از مسیر ریشه مثال فعال اجرا می‌شود؛ `python manage.py runserver 127.0.0.1:8001 --noreload` یا معادل مستند؛ با Restart فرایند قبلی graceful و با timeout بسته شود.
- Run باید startup failure را تشخیص دهد (exit code، log یا health probe کوتاه) و اشتباهاً «running» نشان ندهد.
- دستورهای فرایند بدون shell interpolation و با آرگومان‌های ثابت ساخته شوند. Timeout، محدودیت خروجی log و cleanup هنگام خاموش شدن runner داشته باشند.
- خواندن/نوشتن فایل صرفاً در ریشه مجاز مثال باشد، با canonical path validation و reject کردن traversal و symlinkهای خارج از root.
- برای MVP فقط فایل‌های متنی امن مانند `.py`, `.json`, `.md`, `.txt` و فایل تنظیمات مرتبط ویرایش شوند؛ `db.sqlite3` و فایل‌های باینری در Editor باز نشوند.
- نمونه Scratch در اولین Run/Startup یک بار initialize شود، در runهای بعدی بازنویسی نشود.
- تنظیمات SQLite پروژه نمونه مسیر دیتابیس را از متغیر محیطی کنترل‌شده `PLAYGROUND_DB_PATH` (با پیش‌فرض `db.sqlite3` داخل همان مثال) بخواند تا Import ایمن داده در PRD 04 بدون تغییر کد نمونه ممکن باشد.
- `runner` اجازه دسترسی به Docker socket و privileged mode ندارد؛ bind mount آزاد از ریشه Host ممنوع است. صفحه وب فقط localhost.
- محدودیت صریح: ایزولاسیون کانتینر برای استفاده شخصی است، نه برای اجرای کد غیرقابل اعتماد افراد ناشناس.

## 5. پیشنهاد Control API برای این فاز

Prefix داخلی: `/v1` (این API عمومی اینترنتی نیست).

| Method | Path | نتیجه |
|---|---|---|
| GET | `/health` | سلامتی runner، مستقل از سلامت مثال |
| GET | `/v1/workspace` | شناسه Scratch، وضعیت اجرا و فایل بازِ پیش‌فرض |
| GET | `/v1/files` | فایل‌های مجاز و مسیر نسبی |
| GET | `/v1/files/content?path=demo/views.py` | محتوا به شکل UTF-8 |
| PUT | `/v1/files/content` | `{ "path": "demo/views.py", "content": "..." }` |
| POST | `/v1/runtime/start` | شروع یا Restart؛ برگرداندن وضعیت |
| POST | `/v1/runtime/stop` | توقف فرایند مثال |
| GET | `/v1/runtime/status` | `state`، آخرین exit code و error خلاصه |
| GET | `/v1/runtime/logs` | آخرین logها با limit |
| POST | `/v1/runtime/request` | `{ "method":"GET", "path":"/api/hello/" }` فقط علیه سرور داخلی |

اسامی endpointها قرارداد مرجع هستند؛ تغییر جزئی تنها در صورت ثبت همزمان در README و تست‌ها مجاز است.

## 6. UI Acceptance

- رابط فارسی RTL، بخش کد و مسیر LTR، editor ساده قابل استفاده. Monaco اختیاری است و نباید تحویل فاز را متوقف کند؛ textarea با monospace قابل قبول است.
- ذخیره، اجرای مجدد و توقف دارای indicator و پیام خطای مشخص باشند.
- اگر صفحه Refresh شود، فایل ذخیره‌شده از بین نرود.
- هنگام ترک فایل ویرایش‌شده یا اجرای کد با تغییرات ذخیره‌نشده، هشدار یا دکمه «Save and Run» واضح نمایش داده شود.
- اگر runner در دسترس نبود، UI یک پیام قابل‌فهم و اقدام «Retry» داشته باشد؛ نمایش spinner بی‌پایان ممنوع.

## 7. Out of Scope

- چند مثال، مدیریت CRUD مثال‌ها، اجرای چند Django هم‌زمان، Terminal عمومی و نصب package.
- API Tester کامل، DB Explorer، Import/Export و سیستم درس/AI.
- Login، authorization و امنیت اجرای کد کاربران ناشناس.

## 8. تست‌های ضروری

- Smoke: `docker compose up --build -d` و `GET /` به درگاه web موفق.
- Smoke: runner health و اجرای `GET /api/hello/` با status 200 و JSON.
- Integration: ذخیره فایل، Restart، تغییر body خروجی، توقف runner.
- Negative: Python SyntaxError موجب وضعیت `error` با log قابل مشاهده شود، بدون crash کنترل API.
- Security: `../../etc/passwd`، absolute path و symlink خارج از root با خطای قابل کنترل رد شوند.
- Persistence: `docker compose restart` بدون حذف volume، کد را حفظ کند.

## 9. Definition of Done

- همه معیارهای بالا با تست خودکار یا شواهد اجرای دستی واقعی تأیید شوند.
- README یک دستور روشن برای شروع و URL داشته باشد.
- نتیجه به شکل خلاصه: فایل‌های تغییر کرده، دستور تست، نتیجه و موارد ناقص گزارش شود.
- بدون mock runtime و بدون API fake با status ساختگی.
