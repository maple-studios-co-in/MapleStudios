import SigningRequests from "@/components/pages/admin/business/SigningRequests";

export default async function Page({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  return <SigningRequests draftId={typeof draft === "string" && /^[0-9a-f]{24}$/.test(draft) ? draft : undefined} />;
}
