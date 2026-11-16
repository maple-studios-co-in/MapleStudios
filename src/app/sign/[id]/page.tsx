import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClientSigning from "@/components/pages/sign/ClientSigning";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private agreement | Maple Studios",
  description: "Review and sign your Maple Studios agreement.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  return <ClientSigning id={id} />;
}
