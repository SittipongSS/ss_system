"use client";

import MaskedNumberInput from "./MaskedNumberInput";
import { formatPhoneInput } from "@/lib/format";

export default function PhoneInput(props) {
  return <MaskedNumberInput {...props} format={formatPhoneInput} maxDigits={10} placeholder={props.placeholder || "081-234-5678"} />;
}
