import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Public')
@Public()
@Controller('public')
export class PublicPaymentStatusController {
  @Get('payment-success')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  success() {
    return renderPaymentStatusPage({
      title: 'Payment received',
      eyebrow: 'Checkout complete',
      body:
        'Your payment has been confirmed. You can close this tab and continue dining.',
      accent: '#1f7a4a',
      icon: 'OK',
    });
  }

  @Get('payment-cancelled')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  cancelled() {
    return renderPaymentStatusPage({
      title: 'Payment not completed',
      eyebrow: 'Checkout cancelled',
      body:
        'No payment was captured. You can close this tab and return to the cashier if you still want to place the order.',
      accent: '#c04b2e',
      icon: '!',
    });
  }
}

function renderPaymentStatusPage(input: {
  title: string;
  eyebrow: string;
  body: string;
  accent: string;
  icon: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: linear-gradient(180deg, #f6efe5 0%, #efe2d2 100%);
      color: #201915;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(460px, 100%);
      background: #fffdfa;
      border: 1px solid #dccfc0;
      border-radius: 28px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 24px 60px rgba(32, 25, 21, 0.12);
    }
    .icon {
      width: 72px;
      height: 72px;
      border-radius: 999px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      font-size: 28px;
      font-weight: 700;
      color: #fffdfa;
      background: ${input.accent};
    }
    .eyebrow {
      color: ${input.accent};
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-size: 0.78rem;
      font-weight: 700;
      margin-bottom: 14px;
    }
    h1 {
      font-family: Georgia, serif;
      font-size: clamp(2rem, 5vw, 2.6rem);
      line-height: 0.98;
      margin-bottom: 14px;
    }
    p {
      color: #675d53;
      line-height: 1.7;
      font-size: 1rem;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="icon">${escapeHtml(input.icon)}</div>
    <div class="eyebrow">${escapeHtml(input.eyebrow)}</div>
    <h1>${escapeHtml(input.title)}</h1>
    <p>${escapeHtml(input.body)}</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
