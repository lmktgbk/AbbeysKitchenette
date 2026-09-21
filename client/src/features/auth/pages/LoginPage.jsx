import AuthBranding from "../components/AuthBranding";
import EmailForm from "../components/EmailForm";
import ModeToggle from "@/components/ModeToggle";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
    return (
        <Card className="relative p-8">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>
            <div className="animate-in fade-in-0 duration-300">
                <AuthBranding />
                <div className="mt-8">
                    <EmailForm />
                </div>
            </div>
        </Card>
    );
}
