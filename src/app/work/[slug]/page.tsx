import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/common/Navbar";
import Footer from "@/components/common/Footer";
import ProjectDetail from "@/components/pages/work/ProjectDetail";
import { isLightProject, WORK_PAGE } from "@/lib/constants";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return WORK_PAGE.projects.map((p) => ({ slug: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = WORK_PAGE.projects.find((p) => p.id === slug);
  if (!project) return { title: "Project — Maple Studios" };
  return {
    title: `${project.title} — Maple Studios`,
    description: project.description,
  };
}

/**
 * Project detail — Figma frame 14:8429 ("Work Details").
 * Sticky left info column, scrolling right image rail.
 */
export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const index = WORK_PAGE.projects.findIndex((p) => p.id === slug);
  if (index === -1) notFound();

  const list = WORK_PAGE.projects;
  const project = list[index];
  const prev = list[(index - 1 + list.length) % list.length];
  const next = list[(index + 1) % list.length];

  const light = isLightProject(project.id);

  return (
    <main
      className={`relative min-h-screen ${
        light
          ? "bg-[#FFF3D3] text-[#741a14] selection:bg-[#741a14] selection:text-[#FFF3D3]"
          : "bg-[#5d1411] text-white selection:bg-[#761c17] selection:text-white"
      }`}
    >
      <Navbar />
      <ProjectDetail project={project} prev={prev} next={next} />
      <Footer />
    </main>
  );
}
