import { createBrowserRouter, Form, useFetcher, useLoaderData, useSubmit } from "react-router";

type Project = {
  readonly id: string;
  readonly name: string;
};

export async function loadProjects() {
  return {
    projects: [{ id: "p-1", name: "Website refresh" }] satisfies Project[],
  };
}

export async function createProjectAction({ request }: { readonly request: Request }) {
  const formData = await request.formData();
  const name = formData.get("title");

  return {
    ok: true,
    projectName: String(name ?? ""),
  };
}

export function ProjectRoute() {
  const fetcher = useFetcher();
  const { projects } = useLoaderData() as Awaited<ReturnType<typeof loadProjects>>;
  const submit = useSubmit();

  function handleQuickCreateProject() {
    submit(
      { title: "Quick project" },
      { method: "post" },
    );
  }

  return (
    <section aria-label="Projects route">
      <ul>
        {projects.map((project) => (
          <li key={project.id}>{project.name}</li>
        ))}
      </ul>
      <Form method="post">
        <label>
          Project title
          <input aria-label="Project title" name="title" />
        </label>
        <button type="submit" aria-label="Create project">
          Create project
        </button>
      </Form>
      <button type="button" aria-label="Quick create project" onClick={handleQuickCreateProject}>
        Quick create project
      </button>
      <fetcher.Form method="post">
        <input type="hidden" name="projectId" value="p-1" />
        <button type="submit" aria-label="Archive project">
          Archive project
        </button>
      </fetcher.Form>
    </section>
  );
}

export const router = createBrowserRouter([
  {
    path: "/projects",
    loader: loadProjects,
    action: createProjectAction,
    Component: ProjectRoute,
  },
]);
