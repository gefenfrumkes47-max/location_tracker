# 📡 מאתר מיקום בזמן אמת

אפליקציה לשיתוף מיקום בין שני אייפונים — מציגה מרחק וזווית ביחס לצפון.

## קבצים בפרויקט

```
location-tracker/
├── server.js        ← שרת Node.js עם Socket.IO
├── package.json     ← תלויות
├── README.md
└── public/
    └── index.html   ← ממשק המשתמש (נטען על הטלפון)
```

## פריסה על Railway (חינם)

### שלב 1 — העלי ל-GitHub
1. צרי repository חדש ב-GitHub (ריק)
2. העלי את כל הקבצים אליו

### שלב 2 — חברי ל-Railway
1. כנסי לאתר: https://railway.app
2. לחצי **"Start a New Project"**
3. בחרי **"Deploy from GitHub repo"**
4. בחרי את ה-repository שהעלית
5. Railway יזהה אוטומטית Node.js ויפרוס

### שלב 3 — קבלי את ה-URL
1. אחרי הפריסה לחצי על **"Generate Domain"**
2. תקבלי URL בסגנון: `https://location-tracker-xxx.railway.app`

### שלב 4 — פתחי על שני הטלפונים
- פתחי את ה-URL בכרום/ספארי על שני האייפונים
- אשרי הרשאות GPS
- המתיני שניות ספורות — המיקום יעודכן בזמן אמת!

## הערות חשובות
- ספארי על iOS מבקש הרשאת GPS בפעם הראשונה — אשרי "Allow While Using App"
- האתר צריך HTTPS (שRailway נותן אוטומטית) כדי ש-GPS יעבוד
- המרחק מחושב לפי Haversine Formula (מדויק לכדור)
- הזווית היא bearing לצפון האמיתי (0°=צפון, 90°=מזרח)
