import { academyModules, academyProjects } from "@/lib/academy";

import { CommandPaletteProvider, type PaletteItem } from "./command-palette";

const PAGES: PaletteItem[] = [
  {
    id: "home",
    kind: "page",
    title: "Dev Playground",
    subtitle: "",
    href: "/",
    keywords: "home hub dev playground start",
  },
  {
    id: "django",
    kind: "page",
    title: "Django Backend Playground",
    subtitle: "",
    href: "/playgrounds/django",
    keywords: "django backend rest api sqlite lab",
  },
  {
    id: "syllabus",
    kind: "page",
    title: "Academy syllabus",
    subtitle: "",
    href: "/playgrounds/database-orm",
    keywords: "academy syllabus curriculum modules overview outline",
  },
  {
    id: "progress",
    kind: "page",
    title: "Progress dashboard",
    subtitle: "",
    href: "/playgrounds/database-orm/progress",
    keywords: "progress dashboard stats completed mastered report",
  },
];

const ITEMS: PaletteItem[] = [
  ...PAGES,
  ...academyProjects.map((project) => ({
    id: project.id,
    kind: "project",
    title: project.title_fa,
    subtitle: project.id,
    href: `/playgrounds/database-orm/projects/${project.id}`,
    keywords: `${project.id} ${project.title_fa} ${project.description_fa} project`.toLowerCase(),
  })),
  ...academyModules.flatMap((module) =>
    module.lessons.map((lesson) => ({
      id: lesson.id,
      kind: "lesson",
      title: lesson.title_fa,
      subtitle: `${module.id} · ${lesson.id}`,
      href: `/playgrounds/database-orm/lessons/${lesson.id}`,
      keywords: `${lesson.id} ${lesson.slug} ${lesson.title_fa} ${lesson.outcome_fa} ${module.id} ${module.title_fa}`.toLowerCase(),
    })),
  ),
];

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return <CommandPaletteProvider items={ITEMS}>{children}</CommandPaletteProvider>;
}
