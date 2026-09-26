require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Szamlazzhu = require('szamlazzhu');
const cors = require('cors');

const app = express();

// CORS engedélyezése a frontend weboldaladhoz
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Raw body parser a Stripe Webhookhoz
app.use((req, res, next) => {
  if (req.originalUrl === '/stripe-webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// Számlázz.hu Kliens
const szamlaClient = new Szamlazzhu.Client({
  authToken: process.env.SZAMLAZZ_HUB_AUTH_TOKEN,
  eInvoice: true,
  requestInvoiceDownload: false
});

// Alapértelmezett teszt végpont
app.get('/', (req, res) => {
  res.send('Meta Ad Studio Backend fut!');
});

// 1. Stripe Checkout Munkamenet Létrehozása (1 990 Ft)
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      line_items: [
        {
          price_data: {
            currency: 'huf',
            product_data: {
              name: '1x Meta Hirdetési Csomag & Generálás',
              description: 'AI A/B szövegek, célzások és beállítási útmutató'
            },
            unit_amount: 199000 // 1 990 Ft fillérben
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/?status=cancel`,
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout Hiba:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Stripe Webhook – Automatikus Számlázz.hu E-számla
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook aláírási hiba: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name || 'Vásárló';
    const address = session.customer_details?.address || {};

    console.log(`[FIZETÉS SIKERES] Számla generálása: ${customerName} (${customerEmail})`);

    try {
      const seller = new Szamlazzhu.Seller({
        bank: { name: 'OTP Bank', accountNumber: '11700000-00000000' },
        email: { replyTo: process.env.SELLER_EMAIL || 'info@a-te-ceged.hu' }
      });

      const buyer = new Szamlazzhu.Buyer({
        name: customerName,
        email: customerEmail,
        sendEmail: true,
        country: address.country || 'Magyarország',
        zip: address.postal_code || '1000',
        city: address.city || 'Budapest',
        address: `${address.line1 || ''} ${address.line2 || ''}`.trim() || 'Cím nem megadott'
      });

      const item = new Szamlazzhu.Item({
        label: 'Meta Hirdetés Generálási Szolgáltatás',
        quantity: 1,
        unit: 'db',
        vat: process.env.SZAMLAZZ_VAT || 'AAM', // '27' ha áfás vagy, 'AAM' ha alanyi mentes
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
      console.log(' Számlázz.hu E-számla sikeresen kiállítva és elküldve!');
    } catch (szamlaErr) {
      console.error(' Hiba a számla kiállításakor:', szamlaErr);
    }
  }

  res.json({ received: true });
});

// 3. Fizetés ellenőrzése
app.get('/verify-payment', async (req, res) => {
  const { session_id } = req.query;
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({ paid: session.payment_status === 'paid' });
  } catch (e) {
    res.json({ paid: false });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Szerver fut a ${PORT}-es porton...`));