import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { academyProjects, getProject } from "@/lib/academy";

import { ProjectWorkspace } from "./project-workspace";

export function generateStaticParams() {
  return academyProjects.map((project) => ({ projectId: project.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const project = getProject(projectId);
  const title = project ? `${project.title_fa} · Projects` : "Project";
  return { title };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) {
    notFound();
  }
  return <ProjectWorkspace project={project} />;
}
