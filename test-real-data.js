import { FetchHttpClient } from './src/infrastructure/http/fetch-http-client.js';
import { CheerioScraper } from './src/infrastructure/scraper/cheerio-scraper.js';

async function testRealData() {
  try {
    console.log('🔄 Gerçek Tribal Wars TR94 verilerini çekiyorum...');
    
    const httpClient = new FetchHttpClient({
      timeout: 30000,
      maxRetries: 3
    });
    
    const scraper = new CheerioScraper(
      httpClient,
      'https://tr.twstats.com/tr94/index.php?page=ennoblements',
      'table.table tbody tr'
    );
    
    const events = await scraper.scrape();
    
    console.log(`✅ ${events.length} olay bulundu!`);
    console.log('\n📊 İlk 5 olay:');
    
    events.slice(0, 5).forEach((event, index) => {
      console.log(`\n${index + 1}. 🏘️ ${event.villageName} (${event.x}|${event.y})`);
      console.log(`   📊 ${event.points} puan`);
      console.log(`   👤 ${event.oldPlayer} [${event.oldTribe || 'No Tribe'}] → ${event.newPlayer} [${event.newTribe || 'No Tribe'}]`);
      console.log(`   ⏰ ${event.timestamp}`);
    });
    
    if (events.length > 5) {
      console.log(`\n... ve ${events.length - 5} olay daha`);
    }
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
  }
}

testRealData(); 