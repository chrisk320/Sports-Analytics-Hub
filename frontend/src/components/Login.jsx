import { googleLogout, GoogleLogin } from "@react-oauth/google";
import { LogOut } from "lucide-react";

const Login = ({ user, setToken }) => {
    const logout = () => {
        googleLogout();
        setToken(null);
    };

    if (user) {
        return (
            <div className="flex items-center space-x-3">
                {user.picture && (
                    <img
                        src={user.picture}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full border border-slate-700"
                    />
                )}
                <button
                    onClick={logout}
                    className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-500 transition-colors px-4 py-2 rounded-lg"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                </button>
            </div>
        );
    }

    // Google Identity Services button — uses FedCM (no popup) where supported,
    // so it isn't subject to the browser's popup blocker like the old flow.
    return (
        <GoogleLogin
            onSuccess={(credentialResponse) => setToken(credentialResponse)}
            onError={() => console.log("Login Failed")}
            theme="filled_black"
            shape="pill"
            text="signin_with"
            size="large"
        />
    );
};

export default Login;
