import { AlenioGoLogo } from "../components/AlenioGoLogo";

export function AlenioGoPage() {
  return (
    <div className="alenio-go-coming-soon" data-testid="alenio-go-page">
      <div className="alenio-go-coming-soon__glow" aria-hidden />
      <div className="alenio-go-coming-soon__card">
        <AlenioGoLogo variant="page" className="alenio-go-coming-soon__logo" />
        <h1 className="alenio-go-coming-soon__title">Something big is cooking.</h1>
        <p className="alenio-go-coming-soon__sub">
          Frontline execution, rebuilt from the ground up. Checklists, sign-offs, and store visibility — all in one
          place.
        </p>
        <p className="alenio-go-coming-soon__hint">We&apos;ll notify your workspace when it&apos;s ready.</p>
      </div>
    </div>
  );
}
