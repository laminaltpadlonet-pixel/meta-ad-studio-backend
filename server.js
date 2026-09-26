require('dotenv').config();
const express = require('express');
const cors = require('cors');


const app = express();

// 1. CORS BEÁLLÍTÁSOK (Kezeli a lezáró perjelet is a FRONTEND_URL-ben)
const rawFrontendUrl = process.env.FRONTEND_URL || '*';
const cleanedFrontendUrl = rawFrontendUrl.replace(/\/$/, ""); // Eltávolítja a lezáró perjelet, ha van[cite: 3]

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || cleanedFrontendUrl === '*' || origin === cleanedFrontendUrl) {
            callback(null, true);
        } else {
            callback(new Error('CORS politika által letiltva'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// 2. REVOLUT API ALAP-BEÁLLÍTÁSOK
const REVOLUT_API_URL = process.env.REVOLUT_ENV === 'sandbox' 
    ? 'https://sandbox-merchant.revolut.com/api/1.0' 
    : 'https://merchant.revolut.com/api/1.0';

// Teszt végpont a szerver működésének ellenőrzéséhez
app.get('/', (req, res) => {
    res.send('A Render Backend Szerver sikeresen fut!');
});

// 3. FIZETÉSI MUNKAMENET LÉTREHOZÁSA (FŐ VÉGPONT)
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { companyName, offer, goal, location, budget } = req.body;

        // Kérés küldése a Revolut Merchant API felé
        const response = await fetch(`${REVOLUT_API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.REVOLUT_SECRET_KEY}`,
                'Content-Type': 'application/json',
                'Revolut-Api-Version': '2023-09-01'
            },
            body: JSON.stringify({
                amount: 199000, // 1 990 Ft (fillérben/centben megadva)
                currency: 'HUF',
                description: `Meta Ad Studio - ${companyName || 'Pro'}`
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Revolut API Hiba:', data);
            return res.status(response.status).json({ error: 'Revolut fizetési hiba', details: data });
        }

        // Visszaküldjük a frontendnek a rendelés adatait és a fizetési linket
        res.json({
            checkoutUrl: data.checkout_url,
            id: data.id,
            token: data.token
        });

    } catch (error) {
        console.error('Szerver hiba a checkout során:', error);
        res.status(500).json({ error: 'Belső szerverhiba történt a fizetés indításakor.' });
    }
});

// 4. ALIAS ÁTIRÁNYÍTÁS: Ha a frontend még a régi /create-order címet hívja[cite: 5, 6]
app.post('/create-order', (req, res, next) => {
    req.url = '/create-checkout-session';
    app._router.handle(req, res, next);
});

// 5. SZERVER INDÍTÁSA
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`A szerver sikeresen elindult a ${PORT}-es porton`);
});
