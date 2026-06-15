# Case Study: OmniPort, wieloprotokołowy enabler pracy developerskiej

## 1. Kontekst

OmniPort powstał jako własna aplikacja desktopowa do pracy z API i protokołami, które często pojawiają się przy integracjach, debugowaniu i budowaniu narzędzi technicznych. Celem nie było stworzenie kolejnego prostego klienta HTTP, tylko jednego miejsca, w którym developer może szybko sprawdzić request, zapisać go w kolekcji, przeanalizować odpowiedź i przejść do innego protokołu bez zmiany narzędzia.

Projekt miał też drugi wymiar: pokazanie, że firma potrafi budować kompletne, dopracowane narzędzia produktowe, nie tylko pojedyncze funkcje. Aplikacja miała być użyteczna w codziennej pracy, ale jednocześnie dobrze wyglądać w portfolio jako przykład desktopowego produktu open source.

## 2. Proces przed aplikacją

Wcześniej praca była rozproszona pomiędzy kilka narzędzi. HTTP było obsługiwane w jednym miejscu, WebSockety w innym, a TCP, UDP i praca na bajtach wymagała osobnych skryptów, terminala albo małych tymczasowych programów. To działało, ale było toporne.

Największym problemem nie był sam brak jednego przycisku. Chodziło o tarcie: przepisywanie adresów, kopiowanie payloadów, brak wspólnego kontekstu requestów, niewygodne wracanie do poprzednich prób i słaba widoczność danych binarnych. Przy debugowaniu integracji łatwo było stracić wątek albo niechcący porównywać dwie różne wersje requestu.

## 3. Rozwiązanie

Zbudowaliśmy OmniPort jako lokalną aplikację desktopową, która łączy kilka trybów pracy w jednym interfejsie. Użytkownik może testować requesty HTTP, gRPC, WebSocket, TCP i UDP, zapisywać je w kolekcjach, wracać do historii i analizować odpowiedzi w czytelny sposób.

Duży nacisk poszedł na UX. Aplikacja nie jest tylko formularzem z przyciskiem "send". Ma wspierać naturalny rytm pracy developera: szybka edycja, natychmiastowy podgląd, bezpieczne zamykanie aktywnych połączeń, widoczne stany requestów i wygodne przechodzenie między kartami, historią oraz kolekcjami.

## 4. Kluczowe funkcje

- Kolekcje requestów z folderami, edycja nazw, drag and drop oraz informacja o stanie requestu względem zapisanej wersji.
- Obsługa wielu protokołów: HTTP, gRPC, WebSocket, TCP i UDP w jednej aplikacji.
- TCP/UDP z trybami odczytu, utrzymywaniem połączenia i kontrolą aktywnych sesji.
- Hex view oraz edytor payloadu bajtowego, projektowane pod pracę z danymi binarnymi, a nie jako zwykłe pole tekstowe.
- Historia requestów i odpowiedzi, dzięki której łatwiej wrócić do poprzednich prób.
- Metryki odpowiedzi i podstawowe informacje techniczne, które pomagają ocenić, co faktycznie wydarzyło się podczas requestu.
- Dopracowany interfejs desktopowy: karty, kolekcje, statusy, modalne potwierdzenia i czytelne stany operacji.
- Projekt open source, który można pokazać, uruchomić lokalnie i rozwijać bez zamkniętej infrastruktury.

## 5. Technologie i integracje

Frontend aplikacji powstał w React. Warstwa desktopowa korzysta z Neutralino, dzięki czemu aplikacja zachowuje się jak natywne narzędzie, ale pozostaje lekka i łatwa do rozwijania. Cięższa komunikacja sieciowa działa przez natywne rozszerzenie napisane w Go.

Taki podział pozwolił zachować wygodny interfejs webowy, a jednocześnie obsłużyć protokoły i scenariusze, które nie pasują dobrze do samego browserowego runtime. Go extension odpowiada m.in. za requesty sieciowe, gRPC oraz TCP/UDP. Aplikacja wspiera też import i pracę z formatami przydatnymi przy dokumentowaniu oraz odtwarzaniu requestów.

W trakcie rozwoju ważną częścią procesu była też nauka ograniczeń wybranej architektury. Neutralino dobrze sprawdziło się jako lekki start, ale praca nad IPC, obsługą aktywnych połączeń oraz zachowaniem okna pokazała, że kolejny etap wymaga mocniejszej integracji frontendu z natywnym backendem. Z tego wynikła decyzja o migracji w stronę Wails, które daje prostszą komunikację IPC, lepsze wsparcie okien i bardziej naturalną ścieżkę do pracy z wieloma oknami.

## 6. Bezpieczeństwo i dane

OmniPort jest aplikacją local-first. Dane kolekcji, historia i stan sesji są przechowywane lokalnie, bez centralnego backendu. Requesty nie muszą przechodzić przez zewnętrzny serwer pośredniczący. Dostęp do danych zależy od maszyny, na której uruchomiona jest aplikacja.

Aplikacja może działać offline w zakresie pracy z zapisanymi kolekcjami, historią i lokalnymi requestami. Sieć jest potrzebna dopiero wtedy, gdy użytkownik odpytuje zewnętrzny endpoint. Model open source dodatkowo ułatwia sprawdzenie, co aplikacja robi z danymi i gdzie są one przechowywane.

## 7. Efekty

Po pierwszych próbach z kilkoma developerami aplikacja została odebrana pozytywnie. Najczęściej pojawiały się uwagi dotyczące wygody pracy: mniej przełączania między narzędziami, szybsze wracanie do zapisanych requestów i lepsza kontrola nad tym, co zostało zmienione.

Szczególnie dobrze sprawdziły się kolekcje, TCP/UDP oraz hex view, bo te obszary zwykle wymagały osobnych obejść albo pracy w terminalu. Feedback pomógł też dopracować detale UX: stany kart, zapis requestów w kolekcjach, czytelniejsze akcje destrukcyjne i zachowanie aktywnych połączeń.

Nie mierzyliśmy efektów liczbowo. Najważniejszy wynik był praktyczny: praca stała się płynniejsza, mniej podatna na pomyłki i łatwiejsza do pokazania innym osobom w zespole.

## 8. Co dalej?

Kolejne wersje mogą pójść w kilku kierunkach. Naturalnym krokiem jest dalsze wzmacnianie pracy z kolekcjami, rozbudowa metryk requestów oraz wygodniejsze porównywanie prób. Warto też rozwijać obsługę danych binarnych, szczególnie w TCP/UDP i WebSocketach.

Po stronie architektury najważniejszym kierunkiem jest migracja na Wails. To nie jest zmiana dla samej zmiany, tylko wniosek z dotychczasowej pracy: aplikacja potrzebuje pewniejszego IPC, wygodniejszej obsługi natywnych okien i lepszego fundamentu pod multi-window. Dzięki temu dalszy rozwój może skupić się bardziej na funkcjach produktu, a mniej na obchodzeniu ograniczeń warstwy desktopowej.

Po stronie produktu sensowne są również gotowe scenariusze testowe, lepszy import i eksport kolekcji, więcej narzędzi diagnostycznych oraz dalsze porządkowanie UX wokół wielu aktywnych kart. Jako projekt open source OmniPort może też rosnąć przez małe, praktyczne usprawnienia wynikające z realnego użycia.

## Podsumowanie

OmniPort powstał, bo codzienna praca z integracjami nie kończy się na HTTP. Developerzy potrzebują narzędzia, które pozwala szybko przechodzić między protokołami, trzymać porządek w requestach i wygodnie analizować odpowiedzi, także binarne.

Aplikacja uporządkowała ten proces w jednym desktopowym produkcie. Dała lepszy workflow, wygodniejszy interfejs i konkretny przykład tego, jak można zamienić wewnętrzną potrzebę techniczną w narzędzie gotowe do pokazania publicznie.
