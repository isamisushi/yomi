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
      <label>
        Account email
        <input aria-label="Account email" {...register("accountEmail")} />
      </label>
      {errors.accountEmail ? (
        <p role="alert">{errors.accountEmail.message}</p>
      ) : null}
    </form>
  );
}
