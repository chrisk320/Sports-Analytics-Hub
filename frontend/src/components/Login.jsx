import { googleLogout, useGoogleLogin } from "@react-oauth/google";
import { User, LogOut } from "lucide-react";

const Login = ({ user, setToken }) => {
    const login = useGoogleLogin({
        onSuccess: (codeResponse) => {
            setToken(codeResponse);
        },
        onError: (error) => console.log("Login Failed:", error),
    });

    const logout = () => {
        googleLogout();
        setToken(null);
    }

    if (user) {
        return (
            <div className="flex items-center space-x-4">
                <button 
                    onClick={logout}
                    className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 transition-colors px-4 py-2 rounded-lg"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                </button>
            </div>
        );
    }

    return (
        <button className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 transition-colors px-4 py-2 rounded-lg" onClick={() => login()}>
            <User className="w-5 h-5" />
            <span>Sign In</span>
        </button>
    );
};

export default Login;