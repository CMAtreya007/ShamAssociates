from app.services.nse_fetcher import NSEFetcher, safe_float
import io, zipfile, csv
from datetime import datetime, timedelta

def test_full_bhav():
    fetcher = NSEFetcher()
    now = datetime.now()
    # Find latest trading day
    bhav_map = {}
    for offset in range(7):
        d = now - timedelta(days=offset)
        if d.weekday() in (5, 6):
            continue
        ymd = d.strftime("%Y%m%d")
        url = f"https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{ymd}_F_0000.csv.zip"
        res = fetcher.session.get(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.nseindia.com/"}, timeout=15)
        if res.status_code == 200 and len(res.content) > 1000:
            zf = zipfile.ZipFile(io.BytesIO(res.content))
            with zf.open(zf.namelist()[0]) as f:
                csv_text = io.TextIOWrapper(f, encoding="utf-8", errors="ignore").read()
                reader = csv.DictReader(io.StringIO(csv_text))
                for row in reader:
                    series = (row.get("SctySrs") or row.get("SERIES") or "").strip()
                    sym = (row.get("TckrSymb") or row.get("SYMBOL") or "").strip().upper()
                    if series != "EQ" or not sym:
                        continue
                    
                    open_p = safe_float(row.get("OpnPric") or row.get("OPEN_PRICE"))
                    high_p = safe_float(row.get("HghPric") or row.get("HIGH_PRICE"))
                    low_p = safe_float(row.get("LwPric") or row.get("LOW_PRICE"))
                    cls_p = safe_float(row.get("ClsPric") or row.get("CLOSE_PRICE") or row.get("LastPric"))
                    prev_p = safe_float(row.get("PrvsClsgPric") or row.get("PREV_CLOSE"))
                    vol = safe_float(row.get("TtlTradgVol") or row.get("TTL_TRD_QNTY"))
                    turnover = safe_float(row.get("TtlTrfVal") or row.get("TURNOVER_LACS"))
                    isin = row.get("ISIN") or ""
                    comp_name = row.get("FinInstrmNm") or sym

                    chg = round(cls_p - prev_p, 2) if (cls_p is not None and prev_p is not None) else None
                    p_chg = round(((chg / prev_p) * 100.0), 2) if (chg is not None and prev_p and prev_p > 0) else None

                    bhav_map[sym] = {
                        "symbol": sym,
                        "companyName": comp_name,
                        "series": series,
                        "isin": isin,
                        "open": open_p,
                        "dayHigh": high_p,
                        "dayLow": low_p,
                        "previousClose": prev_p,
                        "lastPrice": cls_p,
                        "change": chg,
                        "pChange": p_chg,
                        "totalTradedVolume": vol,
                        "totalTradedValue": turnover
                    }
            print(f"Date {ymd}: Successfully extracted {len(bhav_map)} full NSE equities!")
            break
    
    print("Sample 5 stocks:")
    for s in list(bhav_map.keys())[:5]:
        print(bhav_map[s])

if __name__ == "__main__":
    test_full_bhav()
