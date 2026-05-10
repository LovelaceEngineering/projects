import { redirect } from "next/navigation";
import { CALENDLY_URL } from "@/lib/constants";

export default function ContactPage() {
  redirect(CALENDLY_URL);
}
