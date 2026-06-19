import { Header } from "@/components/site/header";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { HowItWorks } from "@/components/sections/how-it-works";
import { WhatYouGet } from "@/components/sections/what-you-get";
import { ClosingCta } from "@/components/sections/closing-cta";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <div className="hairline container" />
        <Problem />
        <HowItWorks />
        <WhatYouGet />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
