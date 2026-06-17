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
      <label>
        Support email
        <input
          aria-label="Support email"
          {...register("supportEmail", {
            required: "Support email is required.",
            pattern: /@example\.com$/,
          })}
        />
      </label>
      {errors.supportEmail ? (
        <p role="alert">{errors.supportEmail.message}</p>
      ) : null}
      <button type="button" aria-label="Check support email" onClick={handleServerValidation}>
        Check support email
      </button>
    </form>
  );
}
