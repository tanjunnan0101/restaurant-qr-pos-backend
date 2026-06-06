import { randomUUID } from 'node:crypto';
import http from 'node:http';
import process from 'node:process';
import { URLSearchParams } from 'node:url';

const port = Number(process.env.FAKE_STRIPE_PORT || 18181);

const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/checkout/sessions') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Not found' } }));
    return;
  }

  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => {
    const params = new URLSearchParams(body);
    const id = `cs_test_local_${randomUUID().replaceAll('-', '')}`;
    const paymentIntentId = `pi_test_local_${randomUUID().replaceAll('-', '')}`;
    const amount = Number(
      params.get('line_items[0][price_data][unit_amount]') || 0,
    );
    const currency = params.get('line_items[0][price_data][currency]') || 'sgd';

    response.writeHead(200, {
      'content-type': 'application/json',
      'request-id': `req_test_local_${randomUUID().replaceAll('-', '')}`,
    });
    response.end(
      JSON.stringify({
        id,
        object: 'checkout.session',
        amount_total: amount,
        client_reference_id: params.get('client_reference_id'),
        currency,
        expires_at: Math.floor(Date.now() / 1000) + 1800,
        payment_intent: paymentIntentId,
        payment_status: 'unpaid',
        status: 'open',
        url: `http://127.0.0.1:${port}/checkout/${id}`,
      }),
    );
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Fake Stripe listening on ${port}\n`);
});
