import { inr } from "@/lib/money";
import { AppButton } from "./AppButton";
import { Claim } from "./Claim";
import { ProductShot } from "./ProductShot";

type Props = {
  busy: boolean;
  merchant: string;
  product: string;
  skuId?: string;
  pricePaise: number;
  typeClaim?: boolean;
  onReview: () => void;
};

export function AiRequest({
  busy,
  merchant,
  product,
  skuId = "sku_shirt_red_cotton",
  pricePaise,
  typeClaim = true,
  onReview,
}: Props) {
  return (
    <section className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_220px]">
      <div>
        <p className="text-[16px] text-mute">An agent wants this shirt.</p>
        <div className="mt-3">
          <Claim play={typeClaim} />
        </div>
        <p className="mt-4 text-[17px] text-mute">
          {merchant} · {inr(pricePaise)}
        </p>
        <div className="mt-6">
          <AppButton disabled={busy} onClick={onReview}>
            Authorize with BOUND →
          </AppButton>
        </div>
      </div>
      <ProductShot skuId={skuId} name={product} />
    </section>
  );
}
