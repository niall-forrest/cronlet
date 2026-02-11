import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { JobsOverview } from "./pages/JobsOverview";
import { JobDetail } from "./pages/JobDetail";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<JobsOverview />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
      </Routes>
    </Layout>
  );
}
