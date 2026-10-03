# رفع المشروع على GitHub (حل مشكلة الـ push)

## ليه مكنش بيرتفع؟ (شخبط بالتحديد)
1. **مفيش remote**: `.git/config` ما فيهوش أي `origin` — المستودع محلي فقط.
2. **مفيش توكن/صلاحيات**: البيئة دي معزولة، مفيش `gh` ولا متغيرات `GH_TOKEN`/`GITHUB_TOKEN`.
3. **الالتزامات كانت على فرع تاني**: كل شغل المرحلة 1 و2 كان اتعمل على فرع
   `qwen-code-…` مش على `main` ← **(تم إصلاحها دلوقتي: `main` = `f54f802` بـ fast-forward merge)**.

## الحل — خطوة بخطوة

### أ) لو عندك GitHub CLI
```bash
cd /workspace
gh auth login                      # تسجيل دخول بالتصفح
gh repo create kroto --private --source=. --remote=origin --push
```

### ب) manually (بدون gh)
```bash
# 1) اعمل مستودع فاضي على github.com/new (من غير README عشان نتجنب conflicts)
git remote add origin https://github.com/<USERNAME>/kROTO.git
git branch -M main
git push -u origin main
# هيطلب Username + Password → استخدم Personal Access Token (مش الباسورد):
# Settings → Developer settings → Personal access tokens → Fine-grained → scopes: Contents: Read and write
```

### ج) SSH (الأريح للمدى الطويل)
```bash
ssh-keygen -t ed25519 -C "you@mail.com" && cat ~/.ssh/id_ed25519.pub
# الصق المفتاح في GitHub → Settings → SSH and GPG keys
git remote add origin git@github.com:<USERNAME>/kROTO.git
git push -u origin main
```

## بعد أول push — CI هيشتغل تلقائيًا
`.github/workflows/ci.yml` يحتاج Secrets دول في المستودع
(Settings → Secrets and variables → Actions → New repository secret):

| Secret | القيمة |
|---|---|
| `DATABASE_URL` | string تجريبي (`postgresql://test:test@localhost:5432/test`) — CI يعمل migrate على service container |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | قيم عشوائية طويلة |
| `CODE_ENC_KEY` | مفتاح تشفير الأكواد (64 hex) |
| `BTCPAY_API_KEY`, `BTCPAY_WEBHOOK_SECRET` | من BTCPay Greenfield |
| `RESEND_API_KEY` | من resend.com |

> ⚠️ مترفعش ملف `.env` أبدًا — هو في `.gitignore`. ارفع `.env.example` بس (موجود ومرفوع).

## التحقق
```bash
git remote -v && git log --oneline -3   # لازم تظهر f54f802, 4f444f3, b5c5bea
git ls-files | head                     # الملفات كلها tracked
```
