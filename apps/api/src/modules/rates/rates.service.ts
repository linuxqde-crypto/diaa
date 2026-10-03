import { HttpException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { CryptoCurrency, Network } from '@prisma/client';
import { RedisService } from '../../common/redis.service';

/** Public rate source for PHASE 2 (UI coin/network picker). PHASE 3 swaps to PaymentProvider.getRate + DB rate lock. */
const COIN_DEFS: Record<CryptoCurrency, { id: string; nameAr: string; symbol: string }> = {
  BTC: { id: 'bitcoin', nameAr: 'بيتكوين', symbol: 'BTC' },
  ETH: { id: 'ethereum', nameAr: 'إيثيريوم', symbol: 'ETH' },
  USDT: { id: 'tether', nameAr: 'تيثر دولار', symbol: 'USDT' },
  SOL: { id: 'solana', nameAr: 'سولانا', symbol: 'SOL' },
  BNB: { id: 'binancecoin', nameAr: 'بينانس كوين', symbol: 'BNB' },
};

const NETWORK_LABELS: Record<Network, string> = {
  BTC: 'شبكة Bitcoin',
  ETH: 'Ethereum (ERC20)',
  TRON: 'Tron (TRC20) — الأسرع والأرخص لـ USDT',
  SOLANA: 'Solana',
  BNB_CHAIN: 'BNB Smart Chain (BEP20)',
};

@Injectable()
export class RatesService {
  constructor(private readonly redis: RedisService) {}

  /** USD price per unit, cached in Redis for 60s. Throws 503 if the feed is down. */
  async usdPrice(currency: CryptoCurrency): Promise<number> {
    const key = `rates:usd:${currency}`;
    const cached = await this.redis.getJson<number>(key);
    if (typeof cached === 'number') return cached;

    try {
      const { data } = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
        params: { ids: COIN_DEFS[currency].id, vs_currencies: 'usd' },
        timeout: 5000,
      });
      const price = Number(data?.[COIN_DEFS[currency].id]?.usd);
      if (!Number.isFinite(price) || price <= 0) throw new Error('bad payload');
      await this.redis.setJson(key, price, 60);
      return price;
    } catch {
      throw new HttpException('تعذّر جلب السعر اللحظي للعملات، حاول بعد لحظات', 503);
    }
  }

  /** UI-friendly quote table: crypto amount per $1 for every supported coin (approximate until PHASE 3 locks rates). */
  async quotes(): Promise<
    { currency: CryptoCurrency; network: Network[]; nameAr: string; symbol: string; usdPerUnit: number; perUsd: number }[]
  > {
    const currencies = Object.keys(COIN_DEFS) as CryptoCurrency[];
    const results = await Promise.allSettled(currencies.map((c) => this.usdPrice(c)));
    return currencies
      .map((currency, i) => {
        const r = results[i];
        if (r.status !== 'fulfilled') return null;
        const usdPerUnit = r.value;
        return {
          currency,
          network: networksFor(currency),
          nameAr: COIN_DEFS[currency].nameAr,
          symbol: COIN_DEFS[currency].symbol,
          usdPerUnit,
          perUsd: Math.round((1 / usdPerUnit) * 1e8) / 1e8,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  labelFor(network: Network): string {
    return NETWORK_LABELS[network];
  }
}

export function networksFor(currency: CryptoCurrency): Network[] {
  switch (currency) {
    case 'BTC':
      return [Network.BTC];
    case 'ETH':
      return [Network.ETH];
    case 'SOL':
      return [Network.SOLANA];
    case 'BNB':
      return [Network.BNB_CHAIN];
    case 'USDT':
      return [Network.TRON, Network.ETH, Network.BNB_CHAIN];
  }
}
