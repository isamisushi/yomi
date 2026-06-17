import { useForm } from "react-hook-form";

type BillingContactFormValues = {
  readonly billingEmail: string;
  readonly contactName: string;
};

export function BillingContactForm() {
  const { handleSubmit, register } = useForm<BillingContactFormValues>({
    defaultValues: {
      billingEmail: "billing@example.com",
      contactName: "Ada Lovelace",
    },
  });

  function handleSaveBillingContact(values: BillingContactFormValues) {
    void values;
  }

  return (
    <form aria-label="Billing contact form" onSubmit={handleSubmit(handleSaveBillingContact)}>
      <label>
        Billing email
        <input aria-label="Billing email" {...register("contactEmail")} />
      </label>
      <button type="submit" aria-label="Save billing contact">
        Save billing contact
      </button>
    </form>
  );
}
