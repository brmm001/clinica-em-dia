import type { Metadata } from "next";
import Link from "next/link";
import Workspace from "./workspace";
import "./gestao.css";

export const metadata: Metadata = { title: "Gestão e CRM", robots: { index: false, follow: false } };

export default function Page() {
  return <>
    <header className="topbar">
      <Link className="brand" href="/">Clínica em Dia</Link>
      <Link href="/orcamento-odontologico">Editor de orçamentos</Link>
    </header>
    <main className="clinic-workspace">
      <Workspace />
    </main>
  </>;
}
