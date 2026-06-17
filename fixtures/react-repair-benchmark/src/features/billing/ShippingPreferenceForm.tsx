import { Controller, useForm } from "react-hook-form";

type ShippingPreferenceFormValues = {
  readonly shippingCountry: string;
};

type CountrySelectProps = {
  readonly "aria-label": string;
  readonly name: string;
  readonly onBlur: () => void;
  readonly onChange: (value: string) => void;
  readonly value: string;
};

function CountrySelect(props: CountrySelectProps) {
  return (
    <select
      aria-label={props["aria-label"]}
      name={props.name}
      onBlur={props.onBlur}
      onChange={(event) => props.onChange(event.target.value)}
      value={props.value}
    >
      <option value="">Select country</option>
      <option value="jp">Japan</option>
      <option value="us">United States</option>
    </select>
  );
}

export function ShippingPreferenceForm() {
  const { control } = useForm<ShippingPreferenceFormValues>({
    defaultValues: {
      shippingCountry: "",
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
          <CountrySelect aria-label="Shipping country" {...field} />
        )}
      />
    </form>
  );
}
