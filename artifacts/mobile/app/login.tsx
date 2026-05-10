import { Redirect } from "expo-router";

export default function LoginRedirect() {
  return <Redirect href="/(auth)/login" />;
}
