import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { extractProjectGraph } from "../src/extractor";

describe("extractProjectGraph", () => {
  test("extracts source-linked React repair graph nodes from a TSX project", async () => {
    const projectPath = await createFixtureProject({
      "src/routes/CustomersRoute.tsx": `
        import { CustomerSearchPanel } from "../features/customers/CustomerSearchPanel";

        export function CustomersRoute() {
          return <CustomerSearchPanel />;
        }
      `,
      "src/components/ui/SearchInput.tsx": `
        type SearchInputProps = {
          "aria-label": string;
          value: string;
          onChange: (event: { target: { value: string } }) => void;
        };

        export function SearchInput(props: SearchInputProps) {
          return <input aria-label={props["aria-label"]} value={props.value} onChange={props.onChange} />;
        }
      `,
      "src/features/customers/CustomerSearchPanel.tsx": `
        import { useEffect, useState } from "react";
        import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
        import useSWR, { mutate } from "swr";
        import { CustomerList } from "./CustomerList";
        import { SearchInput } from "../../components/ui/SearchInput";
        import { trackCustomerSearch } from "./analytics";

        type Customer = { name: string };

        export function CustomerSearchPanel() {
          const [query, setQuery] = useState("");
          const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
          const queryClient = useQueryClient();
          const customers = useQuery({
            queryKey: ["customers", query],
            queryFn: () => fetch("/api/customers?q=" + query).then((response) => response.json()),
          });
          const customerSummary = useSWR(["customer-summary", query], () => fetch("/api/customer-summary?q=" + query));

          function handleQueryChange(event: { target: { value: string } }) {
            setQuery(event.target.value);
          }

          const handleClearCustomer = () => {
            setSelectedCustomer(null);
          };

          const handleSelectCustomer = (customer: Customer) => {
            setSelectedCustomer(customer);
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            queryClient.setQueryData(["customers", customer.name], customer);
            mutate(["customer-summary", query]);
            customers.refetch();
          };

          const archiveMutation = useMutation({
            mutationFn: async (customer: Customer) => customer,
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: ["archived-customers"] });
            },
          });

          const listProps = {
            onSelect: handleSelectCustomer,
          };

          useEffect(() => {
            fetch("/api/customers?q=" + query)
              .then((response) => response.json())
              .then((customer: Customer) => setSelectedCustomer(customer));
          }, [query]);

          return (
            <section>
              <SearchInput
                aria-label="Customer search"
                value={query}
                onChange={handleQueryChange}
              />
              <button onClick={handleClearCustomer}>Clear</button>
              <button onClick={trackCustomerSearch}>Track</button>
              <button onClick={() => archiveMutation.mutate({ name: "Ada" })}>Archive customer</button>
              <CustomerList customers={[{ name: "Ada" }]} {...listProps} />
              <div role="status">{selectedCustomer?.name}</div>
            </section>
          );
        }
      `,
      "src/features/customers/CustomerList.tsx": `
        import { CustomerCard } from "./CustomerCard";

        type Customer = { name: string };

        type CustomerListProps = {
          customers: Customer[];
          onSelect: (customer: Customer) => void;
        };

        export function CustomerList({ customers, onSelect }: CustomerListProps) {
          const cardProps = { onSelect };

          return (
            <section>
              {customers.map((customer) => (
                <CustomerCard key={customer.name} customer={customer} {...cardProps} />
              ))}
            </section>
          );
        }
      `,
      "src/features/customers/CustomerCard.tsx": `
        type Customer = { name: string };

        type CustomerCardProps = {
          customer: Customer;
          onSelect: (customer: Customer) => void;
        };

        export function CustomerCard({ customer, onSelect }: CustomerCardProps) {
          return (
            <article>
              <button onClick={() => onSelect(customer)}>Select</button>
            </article>
          );
        }
      `,
      "src/features/customers/analytics.tsx": `
        export function trackCustomerSearch() {
          fetch("/api/analytics/customer-search");
        }
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.components.map((component) => component.id).sort()).toEqual([
      "customer-card",
      "customer-list",
      "customer-search-panel",
      "customers-route",
      "search-input",
    ]);

    expect(graph.components.find((component) => component.id === "customers-route")).toMatchObject({
      role: "route",
      renders: ["customer-search-panel"],
      source: {
        file: "src/routes/CustomersRoute.tsx",
        line: 3,
        symbol: "CustomersRoute",
      },
    });

    expect(graph.components.find((component) => component.id === "search-input")).toMatchObject({
      role: "design-system",
      source: {
        file: "src/components/ui/SearchInput.tsx",
        symbol: "SearchInput",
      },
    });

    expect(graph.designSystemUsages).toEqual([
      expect.objectContaining({
        id: "customer-search-panel-uses-search-input-1",
        ownerComponentId: "customer-search-panel",
        componentId: "search-input",
        componentName: "SearchInput",
        props: ["aria-label", "value", "onChange"],
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 55,
          symbol: "SearchInput",
        },
      }),
    ]);

    expect(graph.props).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "customer-search-panel-passes-search-input-on-change-1-prop",
          ownerComponentId: "customer-search-panel",
          targetComponentId: "search-input",
          propName: "onChange",
          kind: "event-handler",
          value: "handleQueryChange",
          references: ["handleQueryChange"],
          source: {
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 58,
            symbol: "onChange",
          },
        }),
        expect.objectContaining({
          id: "customer-search-panel-passes-customer-list-on-select-1-prop",
          ownerComponentId: "customer-search-panel",
          targetComponentId: "customer-list",
          propName: "onSelect",
          kind: "event-handler",
          references: ["handleSelectCustomer"],
          viaSpread: "listProps",
        }),
        expect.objectContaining({
          id: "customer-list-passes-customer-card-on-select-1-prop",
          ownerComponentId: "customer-list",
          targetComponentId: "customer-card",
          propName: "onSelect",
          kind: "event-handler",
          references: ["onSelect"],
          viaSpread: "cardProps",
        }),
      ]),
    );

    expect(graph.states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "customer-search-panel-query-state",
          name: "query",
          ownerComponentId: "customer-search-panel",
          kind: "local",
        }),
        expect.objectContaining({
          id: "customer-search-panel-selected-customer-state",
          name: "selectedCustomer",
          ownerComponentId: "customer-search-panel",
          kind: "local",
        }),
      ]),
    );

    expect(graph.hooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "customer-search-panel-query-effect",
          name: "useEffect",
          ownerComponentId: "customer-search-panel",
          dependencies: ["query"],
          risk: "high",
        }),
      ]),
    );

    expect(graph.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "customer-search-panel-on-change-1-action",
          ownerComponentId: "customer-search-panel",
          touchesState: ["customer-search-panel-query-state"],
          triggersHooks: ["customer-search-panel-query-effect"],
        }),
        expect.objectContaining({
          id: "customer-search-panel-on-click-2-action",
          ownerComponentId: "customer-search-panel",
          touchesState: ["customer-search-panel-selected-customer-state"],
        }),
        expect.objectContaining({
          id: "customer-search-panel-on-click-3-action",
          ownerComponentId: "customer-search-panel",
          network: ["inline handler network call"],
        }),
        expect.objectContaining({
          id: "customer-card-on-click-1-action",
          ownerComponentId: "customer-card",
          touchesState: ["customer-search-panel-selected-customer-state"],
        }),
      ]),
    );

    expect(graph.remoteData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "customer-search-panel-use-query-1-remote",
          ownerComponentId: "customer-search-panel",
          kind: "react-query",
          key: ["customers", "query"],
          endpoint: "/api/customers?q=",
          risk: "low",
        }),
        expect.objectContaining({
          id: "customer-search-panel-use-swr-2-remote",
          ownerComponentId: "customer-search-panel",
          kind: "swr",
          key: ["customer-summary", "query"],
          endpoint: undefined,
          risk: "low",
        }),
        expect.objectContaining({
          id: "customer-search-panel-fetch-3-remote",
          ownerComponentId: "customer-search-panel",
          kind: "fetch",
          key: ["/api/customers?q="],
          endpoint: "/api/customers?q=",
          risk: "high",
        }),
      ]),
    );

    expect(graph.cacheOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "customer-search-panel-invalidate-1-cache",
          ownerActionId: "customer-card-on-click-1-action",
          ownerComponentId: "customer-search-panel",
          kind: "invalidate",
          targetKey: ["customers"],
        }),
        expect.objectContaining({
          id: "customer-search-panel-set-query-data-2-cache",
          ownerActionId: "customer-card-on-click-1-action",
          ownerComponentId: "customer-search-panel",
          kind: "set-query-data",
          targetKey: ["customers", "customer.name"],
        }),
        expect.objectContaining({
          id: "customer-search-panel-mutate-3-cache",
          ownerActionId: "customer-card-on-click-1-action",
          ownerComponentId: "customer-search-panel",
          kind: "mutate",
          targetKey: ["customer-summary", "query"],
        }),
        expect.objectContaining({
          id: "customer-search-panel-refetch-4-cache",
          ownerActionId: "customer-card-on-click-1-action",
          ownerComponentId: "customer-search-panel",
          kind: "refetch",
          targetKey: [],
        }),
        expect.objectContaining({
          id: "customer-search-panel-invalidate-5-cache",
          ownerActionId: "customer-search-panel-on-click-4-action",
          ownerComponentId: "customer-search-panel",
          kind: "invalidate",
          targetKey: ["archived-customers"],
          trigger: expect.objectContaining({
            kind: "mutation-success",
            reference: "archiveMutation",
          }),
        }),
      ]),
    );

    expect(graph.ui).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "customer-search-panel-search-input-2-ui",
          label: "Customer search",
          role: "input",
          componentId: "search-input",
          actionId: "customer-search-panel-on-change-1-action",
          stateIds: ["customer-search-panel-query-state"],
        }),
        expect.objectContaining({
          id: "customer-search-panel-button-3-ui",
          label: "Clear",
          role: "button",
          actionId: "customer-search-panel-on-click-2-action",
        }),
        expect.objectContaining({
          id: "customer-search-panel-button-4-ui",
          label: "Track",
          role: "button",
          actionId: "customer-search-panel-on-click-3-action",
        }),
        expect.objectContaining({
          id: "customer-search-panel-button-5-ui",
          label: "Archive customer",
          role: "button",
          actionId: "customer-search-panel-on-click-4-action",
        }),
        expect.objectContaining({
          id: "customer-search-panel-customer-list-6-ui",
          label: "Customer List",
          role: "panel",
          componentId: "customer-list",
        }),
        expect.objectContaining({
          id: "customer-search-panel-div-7-ui",
          role: "status",
        }),
        expect.objectContaining({
          id: "customer-card-button-1-ui",
          label: "Select",
          role: "button",
          actionId: "customer-card-on-click-1-action",
          stateIds: ["customer-search-panel-selected-customer-state"],
        }),
      ]),
    );
  });

  test("extracts React Hook Form field validation and error ownership", async () => {
    const projectPath = await createFixtureProject({
      "src/features/billing/SupportValidationForm.tsx": `
        import { useForm } from "react-hook-form";

        type SupportValidationFormValues = {
          readonly supportEmail: string;
        };

        export function SupportValidationForm() {
          const {
            formState: { errors },
            register,
            setError,
          } = useForm<SupportValidationFormValues>({
            defaultValues: {
              supportEmail: "",
            },
          });

          function handleServerValidation() {
            setError("supportEmail", {
              message: "Use a company support email.",
              type: "server",
            });
          }

          return (
            <form aria-label="Support validation form">
              <input
                aria-label="Support email"
                {...register("supportEmail", {
                  required: "Support email is required.",
                  pattern: /@example\\.com$/,
                })}
              />
              {errors.supportEmail ? <p>{errors.supportEmail.message}</p> : null}
              <button onClick={handleServerValidation}>Check support email</button>
            </form>
          );
        }
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.formFields).toEqual([
      expect.objectContaining({
        id: "support-validation-form-support-email-form-field",
        name: "supportEmail",
        ownerComponentId: "support-validation-form",
        stateId: "support-validation-form-support-email-form-state",
        register: expect.objectContaining({
          file: "src/features/billing/SupportValidationForm.tsx",
          symbol: "register",
        }),
        validation: expect.objectContaining({
          options: [
            { name: "required", value: '"Support email is required."' },
            { name: "pattern", value: "/@example\\.com$/" },
          ],
          source: expect.objectContaining({
            file: "src/features/billing/SupportValidationForm.tsx",
            symbol: "required",
          }),
        }),
        errors: expect.arrayContaining([
          expect.objectContaining({
            kind: "read",
            reference: "errors",
            source: expect.objectContaining({
              symbol: "supportEmail",
            }),
          }),
          expect.objectContaining({
            kind: "set",
            reference: "setError",
            source: expect.objectContaining({
              symbol: "setError",
            }),
          }),
        ]),
      }),
    ]);
  });

  test("extracts React Hook Form Controller and useController controlled field ownership", async () => {
    const projectPath = await createFixtureProject({
      "src/features/billing/ShippingPreferenceForm.tsx": `
        import { Controller, useController, useForm } from "react-hook-form";

        type ShippingPreferenceFormValues = {
          readonly shippingCountry: string;
          readonly deliveryWindow: string;
        };

        export function ShippingPreferenceForm() {
          const { control } = useForm<ShippingPreferenceFormValues>({
            defaultValues: {
              shippingCountry: "",
              deliveryWindow: "",
            },
          });
          const { field: deliveryField } = useController({
            control,
            name: "deliveryWindow",
            rules: {
              required: "Delivery window is required.",
            },
          });

          return (
            <form aria-label="Shipping preference form">
              <Controller
                control={control}
                name="shippingCountry"
                rules={{
                  required: "Shipping country is required.",
                }}
                render={({ field }) => (
                  <select aria-label="Shipping country" {...field} />
                )}
              />
              <input aria-label="Delivery window" {...deliveryField} />
            </form>
          );
        }
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.formFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "shippingCountry",
          stateId: "shipping-preference-form-shipping-country-form-state",
          register: expect.objectContaining({
            file: "src/features/billing/ShippingPreferenceForm.tsx",
            symbol: "Controller",
          }),
          validation: expect.objectContaining({
            options: [{ name: "required", value: '"Shipping country is required."' }],
            source: expect.objectContaining({
              symbol: "required",
            }),
          }),
        }),
        expect.objectContaining({
          name: "deliveryWindow",
          stateId: "shipping-preference-form-delivery-window-form-state",
          register: expect.objectContaining({
            file: "src/features/billing/ShippingPreferenceForm.tsx",
            symbol: "useController",
          }),
          validation: expect.objectContaining({
            options: [{ name: "required", value: '"Delivery window is required."' }],
            source: expect.objectContaining({
              symbol: "required",
            }),
          }),
        }),
      ]),
    );
    expect(graph.ui).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Shipping country",
          actionId: expect.stringContaining("register"),
          stateIds: ["shipping-preference-form-shipping-country-form-state"],
        }),
        expect.objectContaining({
          label: "Delivery window",
          actionId: expect.stringContaining("register"),
          stateIds: ["shipping-preference-form-delivery-window-form-state"],
        }),
      ]),
    );
  });

  test("extracts React Hook Form resolver schema field ownership", async () => {
    const projectPath = await createFixtureProject({
      "src/features/billing/AccountSchemaForm.tsx": `
        import { zodResolver } from "@hookform/resolvers/zod";
        import { useForm } from "react-hook-form";
        import { z } from "zod";

        const accountSchema = z.object({
          accountEmail: z.string().email("Use a valid account email."),
          invoiceName: z.string().min(1, "Invoice name is required."),
        });

        type AccountSchemaFormValues = {
          readonly accountEmail: string;
          readonly invoiceName: string;
        };

        export function AccountSchemaForm() {
          const {
            formState: { errors },
            register,
          } = useForm<AccountSchemaFormValues>({
            defaultValues: {
              accountEmail: "",
              invoiceName: "",
            },
            resolver: zodResolver(accountSchema),
          });

          return (
            <form aria-label="Account schema form">
              <input aria-label="Account email" {...register("accountEmail")} />
              {errors.accountEmail ? <p>{errors.accountEmail.message}</p> : null}
            </form>
          );
        }
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.formFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "accountEmail",
          stateId: "account-schema-form-account-email-form-state",
          validation: {
            options: [
              {
                name: "validate",
                value: "zodResolver:accountSchema.accountEmail",
              },
            ],
            source: {
              file: "src/features/billing/AccountSchemaForm.tsx",
              line: 6,
              symbol: "accountEmail",
            },
          },
          errors: expect.arrayContaining([
            expect.objectContaining({
              kind: "read",
              reference: "errors",
              source: expect.objectContaining({
                symbol: "accountEmail",
              }),
            }),
          ]),
        }),
      ]),
    );
  });

  test("extracts React Router loader and Form action ownership", async () => {
    const projectPath = await createFixtureProject({
      "src/features/projects/ProjectRoute.tsx": `
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
                <input aria-label="Project title" name="title" />
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
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.hooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project-route-route-loader",
          name: "route loader",
          ownerComponentId: "project-route",
          source: expect.objectContaining({
            file: "src/features/projects/ProjectRoute.tsx",
            symbol: "loadProjects",
          }),
        }),
        expect.objectContaining({
          id: "project-route-route-action",
          name: "route action",
          ownerComponentId: "project-route",
          source: expect.objectContaining({
            file: "src/features/projects/ProjectRoute.tsx",
            symbol: "createProjectAction",
          }),
        }),
      ]),
    );
    expect(graph.ui).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Create project",
          actionId: "project-route-router-action-1-action",
        }),
        expect.objectContaining({
          label: "Quick create project",
          actionId: "project-route-on-click-2-action",
        }),
        expect.objectContaining({
          label: "Archive project",
          actionId: "project-route-router-action-3-action",
        }),
      ]),
    );
    expect(graph.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project-route-router-action-1-action",
          name: "submit Form",
          triggersHooks: ["project-route-route-action"],
          network: ["React Router route action submit"],
        }),
        expect.objectContaining({
          id: "project-route-on-click-2-action",
          name: "click button",
          triggersHooks: ["project-route-route-action"],
          network: ["React Router imperative action submit"],
        }),
        expect.objectContaining({
          id: "project-route-router-action-3-action",
          name: "submit fetcher.Form",
          triggersHooks: ["project-route-route-action"],
          network: ["React Router route action submit"],
        }),
      ]),
    );
  });

  test("links Next Server Action forms and client calls to server action owners", async () => {
    const projectPath = await createFixtureProject({
      "src/features/invoices/actions.ts": `
        "use server";

        import { revalidatePath, revalidateTag } from "next/cache";
        import { INVOICE_CACHE_TAG } from "./cacheKeys";

        export async function saveInvoice(formData: FormData) {
          const invoiceId = formData.get("invoiceId");

          revalidatePath("/invoices");
          revalidateTag(INVOICE_CACHE_TAG);

          return {
            ok: true,
            invoiceId: String(invoiceId ?? ""),
          };
        }
      `,
      "src/features/invoices/cacheKeys.ts": `
        export const INVOICE_CACHE_TAG = "invoices";
      `,
      "src/features/invoices/InvoiceClient.tsx": `
        "use client";

        import { useRouter } from "next/navigation";
        import { saveInvoice } from "./actions";
        import { InvoiceToolbar } from "./InvoiceToolbar";

        type InvoiceClientProps = {
          readonly exportBuilder?: () => string;
          readonly submitAction?: typeof saveInvoice;
          readonly formatters?: {
            readonly label: () => string;
          };
          readonly presenter?: unknown;
        };

        export function InvoiceClient(_props: InvoiceClientProps) {
          const router = useRouter();

          return (
            <section aria-label="Invoice editor">
              <InvoiceToolbar />
              <form action={saveInvoice}>
                <input type="hidden" name="invoiceId" value="inv-1" />
                <button type="submit" aria-label="Submit invoice">
                  Submit invoice
                </button>
                <button formAction={saveInvoice} aria-label="Approve invoice">
                  Approve invoice
                </button>
              </form>
              <button
                type="button"
                aria-label="Sync invoice"
                onClick={async () => {
                  await saveInvoice(new FormData());
                  router.refresh();
                }}
              >
                Sync invoice
              </button>
            </section>
          );
        }
      `,
      "src/features/invoices/InvoiceToolbar.tsx": `
        export function InvoiceToolbar() {
          return (
            <nav aria-label="Invoice tools">
              <button type="button">Export invoice</button>
            </nav>
          );
        }
      `,
      "src/app/invoices/page.tsx": `
        import { ClientChart } from "@acme/client-widgets";
        import ClientSparkline from "@acme/client-widgets/sparkline";
        import { ClientMetric } from "@acme/client-widgets/widgets/metric";
        import { VirtualGauge } from "@acme/virtual-widgets";
        import { Suspense } from "react";

        import { saveInvoice } from "../../features/invoices/actions";
        import { INVOICE_CACHE_TAG } from "../../features/invoices/cacheKeys";
        import { InvoiceClient } from "../../features/invoices/InvoiceClient";

        type Invoice = {
          readonly id: string;
          readonly status: string;
        };

        class InvoicePresenter {}

        export async function InvoicePage() {
          const response = await fetch("https://api.example.com/invoices", {
            next: {
              tags: [INVOICE_CACHE_TAG],
            },
          });
          const invoices = (await response.json()) as readonly Invoice[];
          const buildInvoiceExport = () => "csv";
          const invoiceFormatters = {
            label: () => "Invoice",
          };

          return (
            <section aria-label="Invoices page">
              <Suspense fallback={<p>Loading invoice editor...</p>}>
                <InvoiceClient
                  exportBuilder={buildInvoiceExport}
                  submitAction={saveInvoice}
                  formatters={invoiceFormatters}
                  presenter={new InvoicePresenter()}
                />
              </Suspense>
              <ClientChart />
              <ClientSparkline />
              <ClientMetric />
              <VirtualGauge />
              {invoices.map((invoice) => (
                <article key={invoice.id}>{invoice.status}</article>
              ))}
            </section>
          );
        }
      `,
      "src/app/invoices/loading.tsx": `
        export default function Loading() {
          return <p>Loading invoices...</p>;
        }
      `,
      "node_modules/@acme/client-widgets/package.json": `
        {
          "name": "@acme/client-widgets",
          "version": "0.0.0",
          "exports": {
            ".": {
              "import": "./index.js",
              "default": "./index.js"
            },
            "./sparkline": {
              "browser": {
                "import": "./sparkline.js",
                "default": "./sparkline.js"
              },
              "default": "./sparkline.js"
            },
            "./widgets/*": {
              "import": "./widgets/*.js",
              "default": "./widgets/*.js"
            }
          }
        }
      `,
      "node_modules/@acme/client-widgets/index.js": `
        "use client";

        export function ClientChart() {
          return null;
        }
      `,
      "node_modules/@acme/client-widgets/sparkline.js": `
        "use client";

        export default function ClientSparkline() {
          return null;
        }
      `,
      "node_modules/@acme/client-widgets/widgets/metric.js": `
        "use client";

        export function ClientMetric() {
          return null;
        }
      `,
      "node_modules/.pnpm/@acme+virtual-widgets@0.0.0/node_modules/@acme/virtual-widgets/package.json": `
        {
          "name": "@acme/virtual-widgets",
          "version": "0.0.0",
          "exports": {
            ".": {
              "import": "./index.js",
              "default": "./index.js"
            }
          }
        }
      `,
      "node_modules/.pnpm/@acme+virtual-widgets@0.0.0/node_modules/@acme/virtual-widgets/index.js": `
        "use client";

        export function VirtualGauge() {
          return null;
        }
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.hooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "invoice-client-save-invoice-server-action",
          name: "server action",
          ownerComponentId: "invoice-client",
          dependencies: ["saveInvoice"],
          source: {
            file: "src/features/invoices/actions.ts",
            line: 6,
            symbol: "saveInvoice",
          },
        }),
        expect.objectContaining({
          id: "invoice-client-router-refresh",
          name: "router refresh",
          ownerComponentId: "invoice-client",
          dependencies: ["router"],
          source: {
            file: "src/features/invoices/InvoiceClient.tsx",
            line: 36,
            symbol: "refresh",
          },
        }),
      ]),
    );
    expect(graph.ui).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Submit invoice",
          actionId: "invoice-client-save-invoice-2-action",
        }),
        expect.objectContaining({
          label: "Approve invoice",
          actionId: "invoice-client-save-invoice-3-action",
        }),
        expect.objectContaining({
          label: "Sync invoice",
          actionId: "invoice-client-on-click-4-action",
        }),
        expect.objectContaining({
          label: "input",
          actionId: undefined,
        }),
      ]),
    );
    expect(graph.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "invoice-client-save-invoice-1-action",
          name: "invoke server action saveInvoice",
          triggersHooks: ["invoice-client-save-invoice-server-action"],
          network: ["Next Server Action submit"],
        }),
        expect.objectContaining({
          id: "invoice-client-save-invoice-2-action",
          name: "invoke server action saveInvoice",
          triggersHooks: ["invoice-client-save-invoice-server-action"],
          network: ["Next Server Action submit"],
        }),
        expect.objectContaining({
          id: "invoice-client-save-invoice-3-action",
          name: "invoke server action saveInvoice",
          triggersHooks: ["invoice-client-save-invoice-server-action"],
          network: ["Next Server Action submit"],
        }),
        expect.objectContaining({
          id: "invoice-client-on-click-4-action",
          name: "click button",
          triggersHooks: [
            "invoice-client-router-refresh",
            "invoice-client-save-invoice-server-action",
          ],
          network: ["Next Server Action call", "Next router.refresh current route"],
        }),
      ]),
    );
    expect(graph.cacheOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "invoice-client-save-invoice-revalidate-path-1-cache-invoice-client-save-invoice-1-action",
          ownerActionId: "invoice-client-save-invoice-1-action",
          ownerComponentId: "invoice-client",
          kind: "revalidate-path",
          targetKey: ["/invoices"],
          source: {
            file: "src/features/invoices/actions.ts",
            line: 9,
            symbol: "revalidatePath",
          },
        }),
        expect.objectContaining({
          id: "invoice-client-save-invoice-revalidate-tag-2-cache-invoice-client-on-click-4-action",
          ownerActionId: "invoice-client-on-click-4-action",
          ownerComponentId: "invoice-client",
          kind: "revalidate-tag",
          targetKey: ["invoices"],
          source: {
            file: "src/features/invoices/actions.ts",
            line: 10,
            symbol: "revalidateTag",
          },
        }),
      ]),
    );
    expect(graph.remoteData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "invoice-page-next-fetch-1-remote",
          ownerComponentId: "invoice-page",
          kind: "next-fetch",
          key: ["invoices"],
          endpoint: "https://api.example.com/invoices",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 19,
            symbol: "fetch",
          },
        }),
      ]),
    );
    expect(graph.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "invoice-page",
          role: "route",
          runtime: "server",
          routeSegment: {
            kind: "page",
            path: "/invoices",
          },
          source: {
            file: "src/app/invoices/page.tsx",
            line: 18,
            symbol: "InvoicePage",
          },
        }),
        expect.objectContaining({
          id: "loading",
          role: "route",
          runtime: "server",
          routeSegment: {
            kind: "loading",
            path: "/invoices",
          },
          source: {
            file: "src/app/invoices/loading.tsx",
            line: 1,
            symbol: "Loading",
          },
        }),
        expect.objectContaining({
          id: "invoice-client",
          runtime: "client",
        }),
        expect.objectContaining({
          id: "acme-client-widgets-client-chart",
          name: "ClientChart",
          role: "external-package",
          runtime: "client",
          packageEntry: {
            packageName: "@acme/client-widgets",
            moduleSpecifier: "@acme/client-widgets",
            importName: "ClientChart",
            entry: "./index.js",
            clientEntry: true,
          },
          source: {
            file: "src/app/invoices/page.tsx",
            line: 1,
            symbol: "ClientChart",
          },
        }),
        expect.objectContaining({
          id: "acme-client-widgets-client-sparkline",
          name: "ClientSparkline",
          role: "external-package",
          runtime: "client",
          packageEntry: {
            packageName: "@acme/client-widgets",
            moduleSpecifier: "@acme/client-widgets/sparkline",
            importName: "default",
            entry: "./sparkline.js",
            clientEntry: true,
          },
          source: {
            file: "src/app/invoices/page.tsx",
            line: 2,
            symbol: "ClientSparkline",
          },
        }),
        expect.objectContaining({
          id: "acme-client-widgets-client-metric",
          name: "ClientMetric",
          role: "external-package",
          runtime: "client",
          packageEntry: {
            packageName: "@acme/client-widgets",
            moduleSpecifier: "@acme/client-widgets/widgets/metric",
            importName: "ClientMetric",
            entry: "./widgets/metric.js",
            clientEntry: true,
          },
          source: {
            file: "src/app/invoices/page.tsx",
            line: 3,
            symbol: "ClientMetric",
          },
        }),
        expect.objectContaining({
          id: "acme-virtual-widgets-virtual-gauge",
          name: "VirtualGauge",
          role: "external-package",
          runtime: "client",
          packageEntry: {
            packageName: "@acme/virtual-widgets",
            moduleSpecifier: "@acme/virtual-widgets",
            importName: "VirtualGauge",
            entry: "./index.js",
            clientEntry: true,
          },
          source: {
            file: "src/app/invoices/page.tsx",
            line: 4,
            symbol: "VirtualGauge",
          },
        }),
        expect.objectContaining({
          id: "invoice-toolbar",
          runtime: "client",
          source: {
            file: "src/features/invoices/InvoiceToolbar.tsx",
            line: 1,
            symbol: "InvoiceToolbar",
          },
        }),
      ]),
    );
    expect(graph.renderEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "invoice-page-renders-invoice-client",
          ownerComponentId: "invoice-page",
          childComponentId: "invoice-client",
          kind: "server-to-client-boundary",
          serializationRisks: [
            {
              propName: "exportBuilder",
              kind: "function",
              source: {
                file: "src/app/invoices/page.tsx",
                line: 34,
                symbol: "exportBuilder",
              },
              note: 'Prop "exportBuilder" passes a regular function across a Server Component -> Client Component boundary. Use a Server Action for mutations or move the function behind the client boundary.',
            },
            {
              propName: "formatters",
              kind: "object-with-function",
              source: {
                file: "src/app/invoices/page.tsx",
                line: 36,
                symbol: "formatters",
              },
              note: 'Prop "formatters" contains a nested function crossing a Server Component -> Client Component boundary. Keep behavior in a Client Component or pass a Server Action explicitly.',
            },
            {
              propName: "presenter",
              kind: "class-instance",
              source: {
                file: "src/app/invoices/page.tsx",
                line: 37,
                symbol: "presenter",
              },
              note: 'Prop "presenter" passes a class instance across a Server Component -> Client Component boundary. Pass plain serializable data instead.',
            },
          ],
          suspenseBoundary: {
            kind: "manual",
            fallback: "Loading invoice editor...",
            source: {
              file: "src/app/invoices/page.tsx",
              line: 32,
              symbol: "Suspense",
            },
            note: "Manual React Suspense boundary controls streaming/fallback for this rendered subtree.",
          },
          source: {
            file: "src/app/invoices/page.tsx",
            line: 33,
            symbol: "InvoiceClient",
          },
        }),
        expect.objectContaining({
          id: "invoice-page-renders-acme-client-widgets-client-chart",
          ownerComponentId: "invoice-page",
          childComponentId: "acme-client-widgets-client-chart",
          kind: "server-to-client-boundary",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 40,
            symbol: "ClientChart",
          },
        }),
        expect.objectContaining({
          id: "invoice-page-renders-acme-client-widgets-client-sparkline",
          ownerComponentId: "invoice-page",
          childComponentId: "acme-client-widgets-client-sparkline",
          kind: "server-to-client-boundary",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 41,
            symbol: "ClientSparkline",
          },
        }),
        expect.objectContaining({
          id: "invoice-page-renders-acme-client-widgets-client-metric",
          ownerComponentId: "invoice-page",
          childComponentId: "acme-client-widgets-client-metric",
          kind: "server-to-client-boundary",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 42,
            symbol: "ClientMetric",
          },
        }),
        expect.objectContaining({
          id: "invoice-page-renders-acme-virtual-widgets-virtual-gauge",
          ownerComponentId: "invoice-page",
          childComponentId: "acme-virtual-widgets-virtual-gauge",
          kind: "server-to-client-boundary",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 43,
            symbol: "VirtualGauge",
          },
        }),
        expect.objectContaining({
          id: "invoice-client-renders-invoice-toolbar",
          ownerComponentId: "invoice-client",
          childComponentId: "invoice-toolbar",
          kind: "render",
          source: {
            file: "src/features/invoices/InvoiceClient.tsx",
            line: 21,
            symbol: "InvoiceToolbar",
          },
        }),
      ]),
    );
  });

  test("extracts external store selector ownership from Zustand-style hooks", async () => {
    const projectPath = await createFixtureProject({
      "src/features/inventory/inventoryViewStore.ts": `
        import { create } from "zustand";

        type InventoryViewState = {
          readonly sortMode: string;
          readonly setSortMode: (sortMode: string) => void;
        };

        export const useInventoryViewStore = create<InventoryViewState>((set) => ({
          sortMode: "createdAt",
          setSortMode: (sortMode) => set({ sortMode }),
        }));
      `,
      "src/features/inventory/InventorySortPanel.tsx": `
        import { useInventoryViewStore } from "./inventoryViewStore";

        export function InventorySortPanel() {
          const sortMode = useInventoryViewStore((state) => state.sortMode);
          const setSortMode = useInventoryViewStore((state) => state.setSortMode);

          return (
            <button type="button" aria-label="Sort by name" onClick={() => setSortMode("name")}>
              Sort by name {sortMode}
            </button>
          );
        }
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.externalStoreUsages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerComponentId: "inventory-sort-panel",
          storeName: "useInventoryViewStore",
          hookName: "useInventoryViewStore",
          selectedFields: ["sortMode"],
          usageKind: "read",
          selectedSources: [
            expect.objectContaining({
              fieldName: "sortMode",
              source: expect.objectContaining({
                file: "src/features/inventory/inventoryViewStore.ts",
                symbol: "sortMode",
              }),
            }),
          ],
        }),
        expect.objectContaining({
          ownerComponentId: "inventory-sort-panel",
          storeName: "useInventoryViewStore",
          hookName: "useInventoryViewStore",
          selectedFields: ["setSortMode"],
          usageKind: "write",
          selectedSources: [
            expect.objectContaining({
              fieldName: "setSortMode",
              source: expect.objectContaining({
                file: "src/features/inventory/inventoryViewStore.ts",
                symbol: "setSortMode",
              }),
            }),
          ],
        }),
      ]),
    );
    expect(graph.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "inventory-sort-panel-on-click-1-action",
          externalStoreUsages: ["inventory-sort-panel-uses-use-inventory-view-store-2-external-store"],
        }),
      ]),
    );
  });

  test("extracts Jotai atom ownership from useAtom and useSetAtom", async () => {
    const projectPath = await createFixtureProject({
      "src/features/inventory/inventoryAtoms.ts": `
        import { atom } from "jotai";

        export const inventorySortAtom = atom("createdAt");
      `,
      "src/features/inventory/InventoryJotaiSortPanel.tsx": `
        import { useAtom, useSetAtom } from "jotai";
        import { inventorySortAtom } from "./inventoryAtoms";

        export function InventoryJotaiSortPanel() {
          const [sortMode, setSortMode] = useAtom(inventorySortAtom);
          const updateSortMode = useSetAtom(inventorySortAtom);

          return (
            <button type="button" aria-label="Sort inventory by name" onClick={() => updateSortMode("name")}>
              Sort by name {sortMode}
            </button>
          );
        }
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.externalStoreUsages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerComponentId: "inventory-jotai-sort-panel",
          storeName: "inventorySortAtom",
          hookName: "useAtom",
          selectedFields: ["sortMode", "setSortMode"],
          usageKind: "read-write",
          selectedSources: [
            expect.objectContaining({
              fieldName: "inventorySortAtom",
              source: expect.objectContaining({
                file: "src/features/inventory/inventoryAtoms.ts",
                symbol: "inventorySortAtom",
              }),
            }),
          ],
        }),
        expect.objectContaining({
          ownerComponentId: "inventory-jotai-sort-panel",
          storeName: "inventorySortAtom",
          hookName: "useSetAtom",
          selectedFields: ["updateSortMode"],
          usageKind: "write",
          selectedSources: [
            expect.objectContaining({
              fieldName: "inventorySortAtom",
              source: expect.objectContaining({
                file: "src/features/inventory/inventoryAtoms.ts",
                symbol: "inventorySortAtom",
              }),
            }),
          ],
        }),
      ]),
    );
    expect(graph.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "inventory-jotai-sort-panel-on-click-1-action",
          externalStoreUsages: [
            "inventory-jotai-sort-panel-uses-inventory-sort-atom-2-external-store",
          ],
        }),
      ]),
    );
  });

  test("extracts Redux Toolkit slice reducer ownership from dispatched actions", async () => {
    const projectPath = await createFixtureProject({
      "src/features/inventory/inventoryFilterSlice.ts": `
        import { configureStore, createSelector, createSlice } from "@reduxjs/toolkit";

        const inventoryFilterSlice = createSlice({
          name: "inventoryFilter",
          initialState: { availability: "all" },
          reducers: {
            setAvailability(state, action: { readonly payload: string }) {
              state.availability = action.payload;
            },
          },
        });

        export const inventoryStore = configureStore({
          reducer: {
            inventoryFilter: inventoryFilterSlice.reducer,
          },
        });

        const selectInventoryFilterState = (state: { inventoryFilter: { availability: string } }) =>
          state.inventoryFilter;

        export const selectInventoryAvailability = createSelector(
          [selectInventoryFilterState],
          (inventoryFilter) => inventoryFilter.availability,
        );

        export const { setAvailability } = inventoryFilterSlice.actions;
      `,
      "src/features/inventory/InventoryFilterPanel.tsx": `
        import { selectInventoryAvailability, setAvailability } from "./inventoryFilterSlice";

        function useAppSelector<T>(selector: (state: { inventoryFilter: { availability: string } }) => T) {
          return selector({ inventoryFilter: { availability: "all" } });
        }

        function useAppDispatch() {
          return (action: unknown) => action;
        }

        export function InventoryFilterPanel() {
          const dispatch = useAppDispatch();
          const availability = useAppSelector(selectInventoryAvailability);

          return (
            <button type="button" aria-label="Show in-stock inventory" onClick={() => dispatch(setAvailability("in-stock"))}>
              Show in-stock {availability}
            </button>
          );
        }
      `,
    });

    const graph = extractProjectGraph({ projectPath });

    expect(graph.reduxActionUsages).toEqual([
      expect.objectContaining({
        id: "inventory-filter-panel-dispatches-set-availability-1-redux-action",
        ownerComponentId: "inventory-filter-panel",
        actionName: "setAvailability",
        sliceName: "inventoryFilterSlice",
        dispatchSource: {
          file: "src/features/inventory/InventoryFilterPanel.tsx",
          line: 16,
          symbol: "dispatch",
        },
        actionSource: expect.objectContaining({
          file: "src/features/inventory/inventoryFilterSlice.ts",
          symbol: "setAvailability",
        }),
        reducerSource: {
          file: "src/features/inventory/inventoryFilterSlice.ts",
          line: 7,
          symbol: "setAvailability",
        },
      }),
    ]);
    expect(graph.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "inventory-filter-panel-on-click-1-action",
          reduxActionUsages: ["inventory-filter-panel-dispatches-set-availability-1-redux-action"],
        }),
      ]),
    );
    expect(graph.reduxSelectorUsages).toEqual([
      expect.objectContaining({
        id: "inventory-filter-panel-selects-inventory-filter-availability-1-redux-selector",
        ownerComponentId: "inventory-filter-panel",
        hookName: "useAppSelector",
        selectedPath: ["inventoryFilter", "availability"],
        selectedSource: {
          file: "src/features/inventory/inventoryFilterSlice.ts",
          line: 5,
          symbol: "availability",
        },
        source: {
          file: "src/features/inventory/InventoryFilterPanel.tsx",
          line: 13,
          symbol: "useAppSelector",
        },
      }),
    ]);
  });
});

async function createFixtureProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-extractor-"));
  await writeFile(
    join(projectPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await Promise.all(
    Object.entries(files).map(async ([filePath, contents]) => {
      const absolutePath = join(projectPath, filePath);
      await mkdir(join(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, normalizeFixtureSource(contents), "utf8");
    }),
  );

  return projectPath;
}

function normalizeFixtureSource(source: string): string {
  const lines = source.replace(/^\n/, "").split("\n");
  const indentation = Math.min(
    ...lines
      .filter((line) => line.trim() !== "")
      .map((line) => line.match(/^ */)?.[0].length ?? 0),
  );

  return `${lines.map((line) => line.slice(indentation)).join("\n").trimEnd()}\n`;
}
