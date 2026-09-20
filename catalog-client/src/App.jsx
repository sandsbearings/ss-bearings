import "./App.css";

function App() {
  return (
    <div className="site">
      <header className="site-header">
        <div className="header-inner">
          <img src="/logo.png" alt="S AND S BEARINGS" className="logo" />
          <span className="tagline">Genuine bearings &amp; industrial parts</span>
        </div>
      </header>

      <section className="hero">
        <h1>S AND S BEARINGS</h1>
        <p>Genuine ball &amp; roller bearings, industrial parts, and cross-reference support</p>
      </section>

      <main className="catalog">
        <section className="info-section">
          <h2 className="section-title">What we stock</h2>
          <p>
            We supply a wide range of ball bearings, roller bearings, and related industrial parts
            from leading brands, with cross-reference support to help you find the right fit.
            Reach out with your bearing number for pricing and availability.
          </p>
        </section>

        <section className="info-section">
          <h2 className="section-title">Get in touch</h2>
          <div className="contact-cards">
            <div className="contact-card">
              <span className="detail-label">Phone</span>
              <a href="tel:+917007543866">+91 7007543866</a>
            </div>
            <div className="contact-card">
              <span className="detail-label">Email</span>
              <a href="mailto:Jaiswal.sawan089@gmail.com">Jaiswal.sawan089@gmail.com</a>
            </div>
            <div className="contact-card">
              <span className="detail-label">Address</span>
              <span>
                Ground Floor Shop No. 1, 57/142 Satranj Mohal, Behind Rani Sati Mandir, Kanpur,
                Uttar Pradesh, 208001
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <img src="/logo.png" alt="S AND S BEARINGS" className="logo footer-logo" />
        <p>Ground Floor Shop No. 1, 57/142 Satranj Mohal, Behind Rani Sati Mandir, Kanpur, Uttar Pradesh, 208001</p>
        <p>+91 7007543866 · Jaiswal.sawan089@gmail.com</p>
      </footer>
    </div>
  );
}

export default App;
