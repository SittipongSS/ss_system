"use client";

import MaskedNumberInput from "./MaskedNumberInput";
import { formatNationalIdInput } from "@/lib/format";

export default function NationalIdInput(props) {
  return <MaskedNumberInput {...props} format={formatNationalIdInput} maxDigits={13} placeholder={props.placeholder || "1-2345-67890-12-3"} />;
}
