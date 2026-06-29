import { Header } from "@/components/site/header";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { HowItWorks } from "@/components/sections/how-it-works";
import { ActionCenter } from "@/components/sections/action-center";
import { Connectors } from "@/components/sections/connectors";
import { DemoGuide } from "@/components/sections/demo-guide";
import { DataNote } from "@/components/sections/data-note";
import { Roadmap } from "@/components/sections/roadmap";
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
        <ActionCenter />
        <Connectors />
        <DemoGuide />
        <DataNote />
        <Roadmap />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
