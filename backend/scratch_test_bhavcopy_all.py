from app.services.nse_fetcher import NSEFetcher
import io, csv, zipfile, pandas as pd
from datetime import datetime, timedelta

fetcher = NSEFetcher()

# Test recent dates
today = datetime.now()
dates_to_test = [(today - timedelta(days=i)) for i in range(10)]

for d in dates_to_test:
    if d.weekday() in (5, 6):
        continue
    ymd = d.strftime("%Y%m%d")
    dmy = d.strftime("%d%m%Y")
    
    url_bhav = f"https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{ymd}_F_0000.csv.zip"
    url_sec = f"https://archives.nseindia.com/products/content/sec_bhavdata_full_{dmy}.csv"
    
    # Try url_bhav
    res = fetcher._get_json_or_bytes = fetcher.session.get(url_bhav, timeout=10)
    print(f"[{ymd}] Bhavcopy ZIP status: {res.status_code}, len: {len(res.content)}")
    if res.status_code == 200 and len(res.content) > 1000:
        try:
            zf = zipfile.ZipFile(io.BytesIO(res.content))
            with zf.open(zf.namelist()[0]) as f:
                df = pd.read_csv(f)
                print(f"   Successfully parsed Bhavcopy! Total rows: {len(df)}")
                print(f"   Columns: {list(df.columns)[:8]}")
                print(f"   EQ stocks count: {len(df[df['SctySrs'] == 'EQ'])}")
                break
        except Exception as e:
            print("   Zip error:", e)
