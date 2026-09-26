
require('dotenv').config();
const express = require('express');
const Szamlazz = require('szamlazz.js');
const cors = require('cors');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

// Számlázz.js Kliens helyes inicializálása
const szamlaClient = new Szamlazz.Client({
  user: {
    authToken: process.env.SZAMLAZZ_HUB_AUTH_TOKEN
  },
  eInvoice: true,
  requestInvoiceDownload: false
});

const REVOLUT_API_URL = 'https://merchant.revolut.com/api/1.0';

app.get('/', (req, res) => {
  res.send('Meta Ad Studio Revolut Backend fut!');
});

// 1. Revolut Checkout Session létrehozása (1 990 Ft)
app.post('/create-checkout-session', async (req, res) => {
  try {
    const response = await fetch(`${REVOLUT_API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REVOLUT_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: 199000,
        currency: 'HUF',
        description: '1x Meta Hirdetési Csomag & Generálás',
        redirect_url: `${process.env.FRONTEND_URL}/?status=success`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Revolut fizetési hiba történt');
    }

    res.json({ url: data.checkout_url });
  } catch (error) {
    console.error('Revolut Checkout Hiba:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Revolut Webhook – Számla kiállítása sikeres fizetés után
app.post('/revolut-webhook', async (req, res) => {
  try {
    const event = req.body;

    if (event.event === 'ORDER_COMPLETED') {
      const order = event.data;
      const customerEmail = order.customer?.email || 'vasarlo@email.hu';
      
      console.log(`[REVOLUT FIZETÉS SIKERES] Számla generálása: ${customerEmail}`);

      const seller = new Szamlazz.Seller({
        bank: { name: 'Revolut Bank', accountNumber: process.env.SELLER_IBAN || 'HU00000000000000000000000000' },
        email: { replyTo: process.env.SELLER_EMAIL || 'info@a-te-ceged.hu' }
      });

      const buyer = new Szamlazz.Buyer({
        name: order.customer?.name || 'Vásárló',
        email: customerEmail,
        sendEmail: true,
        country: 'Magyarország',
        zip: '1000',
        city: 'Budapest',
        address: 'Cím nem megadott'
      });

      const item = new Szamlazz.Item({
        label: 'Meta Hirdetés Generálási Szolgáltatás',
        quantity: 1,
        unit: 'db',
        vat: process.env.SZAMLAZZ_VAT || 'AAM',
        netUnitPrice: 1990,
        itemComment: 'Automata AI Hirdetésgenerálás'
      });

      const invoice = new Szamlazz.Invoice({
        paymentMethod: Szamlazz.PaymentMethod.Bankcard,
        currency: Szamlazz.Currency.HUF,
        seller: seller,
        buyer: buyer,
        items: [item],
        paid: true
      });

      await szamlaClient.issueInvoice(invoice);
      console.log(' Számlázz.js E-számla sikeresen kiállítva!');
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook hiba:', err);
    res.status(500).send('Server Error');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Szerver fut a ${PORT}-es porton...`));
