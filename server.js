require('dotenv').config();
const express = require('express');
const Szamlazzhu = require('szamlazzhu');
const cors = require('cors');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

// Számlázz.hu Kliens
const szamlaClient = new Szamlazzhu.Client({
  authToken: process.env.SZAMLAZZ_HUB_AUTH_TOKEN,
  eInvoice: true,
  requestInvoiceDownload: false
});

const REVOLUT_API_URL = 'https://merchant.revolut.com/api/1.0'; // Éles Revolut API URL

app.get('/', (req, res) => {
  res.send('Meta Ad Studio Revolut Backend fut!');
});

// 1. Revolut Fizetési Megrendelés Létrehozása (1 990 Ft)
app.post('/create-checkout-session', async (req, res) => {
  try {
    const response = await fetch(`${REVOLUT_API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REVOLUT_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: 199000, // 1 990 Ft fillérben/centben
        currency: 'HUF',
        description: '1x Meta Hirdetési Csomag & Generálás',
        redirect_url: `${process.env.FRONTEND_URL}/?status=success`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Revolut hiba történt');
    }

    // Visszaküldjük a fizetési oldalt (checkout_url) a frontendnek
    res.json({ url: data.checkout_url });
  } catch (error) {
    console.error('Revolut Checkout Hiba:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Revolut Webhook – Automatikus Számlázz.hu E-számla
app.post('/revolut-webhook', async (req, res) => {
  try {
    const event = req.body;

    // Ha a fizetés sikeresen megtörtént
    if (event.event === 'ORDER_COMPLETED') {
      const order = event.data;
      const customerEmail = order.customer?.email || 'vasarlo@email.hu';
      
      console.log(`[REVOLUT FIZETÉS SIKERES] Számla generálása: ${customerEmail}`);

      const seller = new Szamlazzhu.Seller({
        bank: { name: 'Revolut Bank', accountNumber: process.env.SELLER_IBAN || 'HU00000000000000000000000000' },
        email: { replyTo: process.env.SELLER_EMAIL || 'info@a-te-ceged.hu' }
      });

      const buyer = new Szamlazzhu.Buyer({
        name: order.customer?.name || 'Vásárló',
        email: customerEmail,
        sendEmail: true,
        country: 'Magyarország',
        zip: '1000',
        city: 'Budapest',
        address: 'Cím nem megadott'
      });

      const item = new Szamlazzhu.Item({
        label: 'Meta Hirdetés Generálási Szolgáltatás',
        quantity: 1,
        unit: 'db',
        vat: process.env.SZAMLAZZ_VAT || 'AAM',
        netUnitPrice: 1990,
        itemComment: 'Automata AI Hirdetésgenerálás'
      });

      const invoice = new Szamlazzhu.Invoice({
        paymentMethod: Szamlazzhu.PaymentMethod.Bankcard,
        currency: Szamlazzhu.Currency.HUF,
        seller: seller,
        buyer: buyer,
        items: [item],
        paid: true
      });

      await szamlaClient.issueInvoice(invoice);
      console.log(' Számlázz.hu E-számla sikeresen kiállítva!');
    }

    res.status(200).send('Webhook fogadva');
  } catch (err) {
    console.error('Webhook hiba:', err);
    res.status(500).send('Server Error');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Szerver fut a ${PORT}-es porton...`));
