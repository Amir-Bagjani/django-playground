# Django Playground — بسته PRD نسخه MVP

این پوشه شامل اسناد آماده برای دادن به یک coding agent است. چهار PRD به ترتیب وابسته به هم هستند و برای جلوگیری از پیچیدگی، هر فاز باید جداگانه تحویل و تست شود.

## فایل‌ها

- `00_PRODUCT_BRIEF.md`: تعریف محصول، معماری دو سرویس، محدوده و معیار موفقیت.
- `PRD-01_FOUNDATION_RUNNER.md`: Docker، Runner، ویرایش فایل، Run/Stop، log.
- `PRD-02_EXAMPLES.md`: مثال‌های پیش‌فرض و شخصی، CRUD و پایداری.
- `PRD-03_API_DATABASE.md`: API Tester، درخواست‌های ذخیره‌شده، SQLite Explorer و Migration.
- `PRD-04_IMPORT_EXPORT.md`: Import/Export مثال و Dataset با JSON.
- `05_AGENT_HANDOFF.md`: پرامپت ایجنت، روند اجرا، تحویل و قالب گزارش.

**نقطه شروع برای ایجنت:** `05_AGENT_HANDOFF.md` را بخواند و بر اساس آن ابتدا `00_PRODUCT_BRIEF.md` و `PRD-01_FOUNDATION_RUNNER.md` را اجرا کند.

**توجه:** این بسته شامل PRD و دستور پیاده‌سازی است؛ کد اجرایی Playground هنوز ساخته نشده است.
