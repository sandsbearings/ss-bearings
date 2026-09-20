import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Billing from "./pages/Billing";
import Invoices from "./pages/Invoices";
import Purchases from "./pages/Purchases";
import Parties from "./pages/Parties";
import Users from "./pages/Users";
import Reports from "./pages/Reports";
import Categories from "./pages/Categories";
import Brands from "./pages/Brands";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/parties" element={<Parties />} />
          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="/billing/edit/:id" element={<Billing />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/users" element={<Users />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/brands" element={<Brands />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
