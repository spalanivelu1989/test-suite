# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: explore-industries.spec.ts >> Explore Industries flow
- Location: tests/explore-industries.spec.ts:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
=========================== logs ===========================
  "domcontentloaded" event fired
  "load" event fired
============================================================
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e7]:
    - link "Tarento" [ref=e9] [cursor=pointer]:
      - /url: /
      - img "Tarento" [ref=e11]
    - navigation [ref=e12]:
      - list [ref=e14]:
        - listitem [ref=e15]:
          - link "Home" [ref=e16] [cursor=pointer]:
            - /url: /
        - listitem [ref=e17]:
          - link "Services" [ref=e18] [cursor=pointer]:
            - /url: /services/
            - text: Services
            - img [ref=e19]
        - listitem [ref=e21]:
          - link "Solutions" [ref=e22] [cursor=pointer]:
            - /url: /solutions/
        - listitem [ref=e23]:
          - link "Industries" [ref=e24] [cursor=pointer]:
            - /url: /industries/
        - listitem [ref=e25]:
          - link "Careers" [ref=e26] [cursor=pointer]:
            - /url: /careers/
        - listitem [ref=e27]:
          - link "About" [ref=e28] [cursor=pointer]:
            - /url: /about/
  - generic [ref=e29]:
    - generic [ref=e31]:
      - img [ref=e33]
      - img "Industries we serve" [ref=e35]
    - generic [ref=e38]:
      - generic [ref=e41]:
        - generic [ref=e42]:
          - link "Home" [ref=e43] [cursor=pointer]:
            - /url: /
            - generic [ref=e44]: Home
          - generic [ref=e45]: "|"
        - link "Industries" [ref=e47] [cursor=pointer]:
          - /url: /industries/
          - generic [ref=e48]: Industries
      - text: Industries we serve
      - generic [ref=e49]:
        - paragraph [ref=e50]: Transforming Industries Through Deep Sector Expertise
        - paragraph [ref=e51]: Tarento's solutions bring together reusable IP, modern platforms, and AI-driven capabilities to address complex enterprise needs across every sector.
      - generic [ref=e52]:
        - button "SPEAK TO OUR EXPERTS" [ref=e53] [cursor=pointer]:
          - text: SPEAK TO OUR EXPERTS
          - img [ref=e55]
        - button "Explore INDUSTRIES" [ref=e58] [cursor=pointer]
  - generic [ref=e61]:
    - generic [ref=e62]:
      - heading "Designed for Real-World Complexity" [level=2] [ref=e63]
      - generic [ref=e64]:
        - generic [ref=e66]:
          - heading "500+" [level=3] [ref=e67]
          - paragraph [ref=e69]:
            - text: Projects
            - strong [ref=e70]: Delivered
        - generic [ref=e72]:
          - heading "50+" [level=3] [ref=e73]
          - paragraph [ref=e75]:
            - text: Enterprise
            - strong [ref=e76]: Clients
        - generic [ref=e78]:
          - heading "6+" [level=3] [ref=e79]
          - paragraph [ref=e81]:
            - strong [ref=e82]: Industries
            - text: Served
        - generic [ref=e84]:
          - heading "Built" [level=3] [ref=e85]
          - paragraph [ref=e87]:
            - text: For
            - strong [ref=e88]: National-Scale
            - text: Impact
    - generic [ref=e90]:
      - paragraph [ref=e91]: Technology alone does not drive transformation - context does. Every industry operates within unique workflows, regulations, and user expectations.
      - paragraph [ref=e93]:
        - text: At Tarento, we combine
        - strong [ref=e94]: domain understanding with engineering depth
        - text: to build solutions that are scalable, compliant, and aligned with how industries actually function. From public digital infrastructure to enterprise platforms, our work is grounded in solving real problems with measurable impact.
  - generic [ref=e96]:
    - generic [ref=e97]:
      - generic [ref=e98]: INDUSTRY FOCUS
      - generic [ref=e99]: Where we Work
      - paragraph [ref=e100]: A consistent approach to building, delivering, and scaling solutions that enterprises can rely on.
    - generic [ref=e101]:
      - generic [ref=e102] [cursor=pointer]:
        - generic [ref=e104]:
          - img [ref=e106]
          - img "Foundations" [ref=e108]
        - generic [ref=e109]:
          - heading "Foundations" [level=3] [ref=e110]:
            - text: Foundations
            - img [ref=e111]
          - generic [ref=e113]:
            - paragraph [ref=e115]: We partner with leading foundations to build scalable digital platforms that drive large-scale social impact across education, healthcare, governance, and sustainability.
            - generic:
              - list:
                - listitem [ref=e116]:
                  - paragraph [ref=e117]:
                    - strong [ref=e118]: Scalable Digital Public Goods (DPG) platforms (Sunbird, MOSIP, open frameworks)
                - listitem [ref=e119]:
                  - paragraph [ref=e120]:
                    - text: Multilingual AI & NLP solutions across
                    - strong [ref=e121]: 22+ Indian languages
                    - text: (Bhashini, ULCA)
                - listitem [ref=e122]:
                  - paragraph [ref=e123]: Offline-first mobile tools for last-mile field enablement
          - generic [ref=e124]:
            - generic [ref=e125]: PARTNERS
            - generic [ref=e126]:
              - generic [ref=e127]: EkStep
              - generic [ref=e128]: Gates Foundation
              - generic [ref=e129]: eGov
              - generic [ref=e130]: Aastrika Foundation
              - generic [ref=e131]: Nudge
              - generic [ref=e132]: Arghyam Foundation
              - generic [ref=e133]: Medtronic Labs
      - generic [ref=e134] [cursor=pointer]:
        - generic [ref=e136]:
          - img [ref=e138]
          - img "Automotive" [ref=e140]
        - generic [ref=e141]:
          - heading "Automotive" [level=3] [ref=e142]:
            - text: Automotive
            - img [ref=e143]
          - generic [ref=e145]:
            - paragraph [ref=e147]: We enable automotive enterprises to transition toward data-driven, software-defined ecosystems across engineering, manufacturing, and connected vehicle platforms.
            - generic:
              - list:
                - listitem [ref=e148]:
                  - paragraph [ref=e149]: Connected vehicle data platforms and real-time telemetry
                - listitem [ref=e150]:
                  - paragraph [ref=e151]: Manufacturing analytics and quality monitoring systems
                - listitem [ref=e152]:
                  - paragraph [ref=e153]: AI-driven diagnostics and predictive maintenance, customer experience.
          - generic [ref=e154]:
            - generic [ref=e155]: CAPABILITIES
            - generic [ref=e156]:
              - generic [ref=e157]: Telematics
              - generic [ref=e158]: iOT
              - generic [ref=e159]: eGov
              - generic [ref=e160]: Manufacturing Analytics
              - generic [ref=e161]: Predictive Maintenance
              - generic [ref=e162]: Voice AI
      - generic [ref=e163] [cursor=pointer]:
        - generic [ref=e165]:
          - img [ref=e167]
          - img "EdTech Solutions" [ref=e169]
        - generic [ref=e170]:
          - heading "EdTech Solutions" [level=3] [ref=e171]:
            - text: EdTech Solutions
            - img [ref=e172]
          - generic [ref=e174]:
            - paragraph [ref=e176]: We build large-scale learning ecosystems that power accessible, inclusive, and continuous education for governments, institutions, and enterprises.
            - generic:
              - list:
                - listitem [ref=e177]:
                  - paragraph [ref=e178]: Platforms built on Digital Public Goods like Sunbird and iGOT
                - listitem [ref=e179]:
                  - paragraph [ref=e180]: Hybrid and multilingual learning experiences
                - listitem [ref=e181]:
                  - paragraph [ref=e182]: Content distribution and learning management systems
                - listitem [ref=e183]:
                  - paragraph [ref=e184]: Gamification and engagement-driven learning models
          - generic [ref=e185]:
            - generic [ref=e186]: CAPABILITIES
            - generic [ref=e187]:
              - generic [ref=e188]: Learning Management
              - generic [ref=e189]: Analytics & Insights
              - generic [ref=e190]: AI
              - generic [ref=e191]: Authoring
              - generic [ref=e192]: Personalization
              - generic [ref=e193]: Governance & Compliance
              - generic [ref=e194]: Recommendations
      - generic [ref=e195] [cursor=pointer]:
        - generic [ref=e197]:
          - img [ref=e199]
          - img "Retail Systems" [ref=e201]
        - generic [ref=e202]:
          - heading "Retail Systems" [level=3] [ref=e203]:
            - text: Retail Systems
            - img [ref=e204]
          - generic [ref=e206]:
            - paragraph [ref=e208]: We design systems that improve visibility, efficiency, and decision-making across retail and distribution networks.
            - generic:
              - list:
                - listitem [ref=e209]:
                  - paragraph [ref=e210]: Dealer and distributor management systems
                - listitem [ref=e211]:
                  - paragraph [ref=e212]:
                    - strong [ref=e213]: SAP Consulting & AMS
                    - text: "- long-term application management for global retail SAP landscapes"
                - listitem [ref=e214]:
                  - paragraph [ref=e215]: Event-driven integrations and cloud automation for scalable, resilient retail operations
          - generic [ref=e216]:
            - generic [ref=e217]: CAPABILITIES
            - generic [ref=e218]:
              - generic [ref=e219]: Retail Analytics
              - generic [ref=e220]: Distribution Automation
              - generic [ref=e221]: Dealer Management
              - generic [ref=e222]: Headless Commerce
              - generic [ref=e223]: Data Platforms
              - generic [ref=e224]: Enterprise Systems
      - generic [ref=e225] [cursor=pointer]:
        - generic [ref=e227]:
          - img [ref=e229]
          - img "Banking & Financial Services" [ref=e231]
        - generic [ref=e232]:
          - heading "Banking & Financial Services" [level=3] [ref=e233]:
            - text: Banking & Financial Services
            - img [ref=e234]
          - generic [ref=e236]:
            - paragraph [ref=e238]: We develop robust platforms that support modern banking, financial operations, and enterprise integrations with a strong focus on security and compliance.
            - generic:
              - list:
                - listitem [ref=e239]:
                  - paragraph [ref=e240]: Connected banking platforms and API-first financial integrations
                - listitem [ref=e241]:
                  - paragraph [ref=e242]: Payments automation and transaction processing at scale
                - listitem [ref=e243]:
                  - paragraph [ref=e244]: Data platforms for financial reporting, risk analytics, and regulatory compliance
                - listitem [ref=e245]:
                  - paragraph [ref=e246]: Enterprise-grade security, audit logging, and compliance-ready architecture
          - generic [ref=e247]:
            - generic [ref=e248]: CAPABILITIES
            - generic [ref=e249]:
              - generic [ref=e250]: Connected Banking
              - generic [ref=e251]: Financial Platforms
              - generic [ref=e252]: Payments Automation
              - generic [ref=e253]: Enterprise Architecture
              - generic [ref=e254]: Cloud Infrastructure
      - generic [ref=e255] [cursor=pointer]:
        - generic [ref=e257]:
          - img [ref=e259]
          - img "Manufacturing" [ref=e261]
        - generic [ref=e262]:
          - heading "Manufacturing" [level=3] [ref=e263]:
            - text: Manufacturing
            - img [ref=e264]
          - generic [ref=e266]:
            - paragraph [ref=e268]: Empowering manufacturers with intelligent platforms, data-driven insights, and modern engineering to build connected and efficient manufacturing ecosystems.
            - generic:
              - list:
                - listitem [ref=e269]:
                  - paragraph [ref=e270]: Manufacturing analytics and quality monitoring across production workflows
                - listitem [ref=e271]:
                  - paragraph [ref=e272]: Supply chain visibility, inventory optimization, and distribution management
                - listitem [ref=e273]:
                  - paragraph [ref=e274]: ERP integration and application management for global manufacturing landscapes
                - listitem [ref=e275]:
                  - paragraph [ref=e276]: AI-driven predictive maintenance and operational automation
          - generic [ref=e277]:
            - generic [ref=e278]: CAPABILITIES
            - generic [ref=e279]:
              - generic [ref=e280]: Data & Analytics
              - generic [ref=e281]: AI
              - generic [ref=e282]: ERP & Core systems
              - generic [ref=e283]: Cloud & Integration
              - generic [ref=e284]: Automation & Workflow
              - generic [ref=e285]: Supply Chain & Inventory
    - generic [ref=e286]:
      - text: Don’t see your industry listed here? That’s okay.
      - paragraph [ref=e287]: We work across a diverse set of industries beyond what’s shown here - bringing together cross-functional expertise, design thinking, engineering depth, and thought leadership to shape solutions that fit your domain, scale with your needs, and deliver measurable impact.
      - button "TALK TO OUR TEAM" [ref=e289] [cursor=pointer]:
        - text: TALK TO OUR TEAM
        - img [ref=e290]
  - generic [ref=e294]:
    - generic [ref=e295]:
      - generic [ref=e296]: HOW WE WORK
      - paragraph [ref=e298]:
        - text: You bring the
        - strong [ref=e299]: domain
        - text: . We bring the craft to solve it together.
      - generic [ref=e300]:
        - paragraph [ref=e301]: "Every engagement starts with a shared question: what does your industry actually need to move forward? Not in theory - but in your context, within your constraints."
        - paragraph [ref=e302]:
          - text: We
          - strong [ref=e303]: co-create with your teams
          - text: combining your domain expertise with our design, engineering, and business thinking to build solutions that fit how your organization actually operates.
      - button "SPEAK TO OUR EXPERTS" [ref=e305] [cursor=pointer]:
        - text: SPEAK TO OUR EXPERTS
        - img [ref=e306]
    - generic [ref=e308]:
      - generic [ref=e309]:
        - img "We start by understanding your world" [ref=e311]
        - generic [ref=e312]:
          - generic [ref=e313]: We start by understanding your world
          - paragraph [ref=e314]: Before any design or code, we invest time in your workflows, your compliance landscape, and the friction your teams deal with daily. But more importantly, we do this with you - aligning early so we are solving the right problems, not just executing assumptions.
      - generic [ref=e315]:
        - img "Design, engineering, and business thinking - together" [ref=e317]
        - generic [ref=e318]:
          - generic [ref=e319]: Design, engineering, and business thinking - together
          - paragraph [ref=e320]: Once the problem is clearly understood, we bring together design, engineering, and business acumen to shape the right solution. This ensures what we build is not just technically sound or well-designed - but also aligned to your goals, constraints, and real-world impact.
      - generic [ref=e321]:
        - img "We build, validate, and evolve - with you" [ref=e323]
        - generic [ref=e324]:
          - generic [ref=e325]: We build, validate, and evolve - with you
          - paragraph [ref=e326]: Go-live is a milestone, not the finish line. We continue to work alongside your teams to ensure what we build is adopted, evolves with your needs, and delivers long-term value.
  - generic [ref=e327]:
    - generic [ref=e328]:
      - generic [ref=e329]:
        - generic [ref=e330]: GET IN TOUCH
        - paragraph [ref=e331]: Across Industries. Building for Real Impact.
        - paragraph [ref=e332]: From complex systems to real-world workflows, we work with you to design solutions that fit your domain, scale with your needs, and deliver measurable impact.
      - button "TALK TO OUR TEAM" [ref=e334] [cursor=pointer]:
        - text: TALK TO OUR TEAM
        - img [ref=e335]
    - generic [ref=e337]:
      - generic [ref=e339]:
        - img "WirelessCar" [ref=e341]
        - img "WoltersKluwer" [ref=e343]
        - img "Xylem" [ref=e345]
        - img "Veoneer" [ref=e347]
        - img "Touchguide" [ref=e349]
        - img "TeliaCompany" [ref=e351]
        - img "Telenor." [ref=e353]
        - img "SSAB" [ref=e355]
        - img "Solteq" [ref=e357]
        - img "Sfx." [ref=e359]
        - img "WirelessCar" [ref=e361]
        - img "WoltersKluwer" [ref=e363]
        - img "Xylem" [ref=e365]
        - img "Veoneer" [ref=e367]
        - img "Touchguide" [ref=e369]
        - img "TeliaCompany" [ref=e371]
        - img "Telenor." [ref=e373]
        - img "SSAB" [ref=e375]
        - img "Solteq" [ref=e377]
        - img "Sfx." [ref=e379]
      - generic [ref=e381]:
        - img "Plastal" [ref=e383]
        - img "Sandvik" [ref=e385]
        - img "Samtrygg" [ref=e387]
        - img "Puma" [ref=e389]
        - img "OlaElectric" [ref=e391]
        - img "Martin&Servera" [ref=e393]
        - img "NIC" [ref=e395]
        - img "NSDC" [ref=e397]
        - img "Ola" [ref=e399]
        - img "Metsa" [ref=e401]
        - img "Plastal" [ref=e403]
        - img "Sandvik" [ref=e405]
        - img "Samtrygg" [ref=e407]
        - img "Puma" [ref=e409]
        - img "OlaElectric" [ref=e411]
        - img "Martin&Servera" [ref=e413]
        - img "NIC" [ref=e415]
        - img "NSDC" [ref=e417]
        - img "Ola" [ref=e419]
        - img "Metsa" [ref=e421]
      - generic [ref=e423]:
        - img "Nibe" [ref=e425]
        - img "Musti" [ref=e427]
        - img "Lithium" [ref=e429]
        - img "Metso" [ref=e431]
        - img "Lulu" [ref=e433]
        - img "IGOTKarmayogi" [ref=e435]
        - img "Nefab" [ref=e437]
        - img "Levis" [ref=e439]
        - img "Ikea" [ref=e441]
        - img "LandshypotekBank" [ref=e443]
        - img "Nibe" [ref=e445]
        - img "Musti" [ref=e447]
        - img "Lithium" [ref=e449]
        - img "Metso" [ref=e451]
        - img "Lulu" [ref=e453]
        - img "IGOTKarmayogi" [ref=e455]
        - img "Nefab" [ref=e457]
        - img "Levis" [ref=e459]
        - img "Ikea" [ref=e461]
        - img "LandshypotekBank" [ref=e463]
      - generic [ref=e465]:
        - img "Islandsbanki" [ref=e467]
        - img "Kering" [ref=e469]
        - img "HM" [ref=e471]
        - img "GatesFoundation" [ref=e473]
        - img "Fora" [ref=e475]
        - img "Kesko" [ref=e477]
        - img "EGov" [ref=e479]
        - img "Hero" [ref=e481]
        - img "EkStep" [ref=e483]
        - img "Deltaco" [ref=e485]
        - img "Islandsbanki" [ref=e487]
        - img "Kering" [ref=e489]
        - img "HM" [ref=e491]
        - img "GatesFoundation" [ref=e493]
        - img "Fora" [ref=e495]
        - img "Kesko" [ref=e497]
        - img "EGov" [ref=e499]
        - img "Hero" [ref=e501]
        - img "EkStep" [ref=e503]
        - img "Deltaco" [ref=e505]
      - generic [ref=e507]:
        - img "Atos" [ref=e509]
        - img "Elkjop" [ref=e511]
        - img "Duni" [ref=e513]
        - img "AssaAbloy" [ref=e515]
        - img "Beckers" [ref=e517]
        - img "Cevt" [ref=e519]
        - img "AshokLeyland" [ref=e521]
        - img "ArionBank" [ref=e523]
        - img "Arvind" [ref=e525]
        - img "Adhaar" [ref=e527]
        - img "Atos" [ref=e529]
        - img "Elkjop" [ref=e531]
        - img "Duni" [ref=e533]
        - img "AssaAbloy" [ref=e535]
        - img "Beckers" [ref=e537]
        - img "Cevt" [ref=e539]
        - img "AshokLeyland" [ref=e541]
        - img "ArionBank" [ref=e543]
        - img "Arvind" [ref=e545]
        - img "Adhaar" [ref=e547]
  - generic [ref=e548]:
    - link "logo" [ref=e550] [cursor=pointer]:
      - /url: /
      - img "logo" [ref=e551]
    - button "START A CONVERSATION WITH US" [ref=e553] [cursor=pointer]:
      - text: START A CONVERSATION WITH US
      - img [ref=e554]
  - generic [ref=e556]:
    - generic [ref=e557]:
      - generic [ref=e559]:
        - generic [ref=e560]: CO-CREATING A BETTER TOMORROW
        - generic [ref=e561]:
          - paragraph [ref=e562]: By accelerating intelligent transformation for forward-thinking enterprises. We deliver Strategic Impact -Accelerated by IP, Grounded in Trust, turning data into decisive competitive advantage.
          - paragraph [ref=e563]: Bold vision meets proven execution, empowering leaders to master AI-driven growth with confidence. Ready to Begin Your Intelligent Enterprise Journey?
        - generic [ref=e564]: Let’s build something meaningful together.
        - generic [ref=e565]:
          - link "GET IN TOUCH" [ref=e566] [cursor=pointer]:
            - /url: /about/#contact
            - text: GET IN TOUCH
            - img [ref=e567]
          - link "EXPLORE CAREERS" [ref=e569] [cursor=pointer]:
            - /url: /careers/
            - text: EXPLORE CAREERS
            - img [ref=e570]
        - generic [ref=e572]:
          - link "https://www.facebook.com/tarentogroup/" [ref=e573] [cursor=pointer]:
            - /url: https://www.facebook.com/tarentogroup/
            - img "https://www.facebook.com/tarentogroup/" [ref=e574]
          - link "https://x.com/tarentogroup" [ref=e575] [cursor=pointer]:
            - /url: https://x.com/tarentogroup
            - img "https://x.com/tarentogroup" [ref=e576]
          - link "https://www.instagram.com/tarento_group/" [ref=e577] [cursor=pointer]:
            - /url: https://www.instagram.com/tarento_group/
            - img "https://www.instagram.com/tarento_group/" [ref=e578]
          - link "https://in.linkedin.com/company/tarento-group" [ref=e579] [cursor=pointer]:
            - /url: https://in.linkedin.com/company/tarento-group
            - img "https://in.linkedin.com/company/tarento-group" [ref=e580]
          - link "https://www.youtube.com/@tarentogroup" [ref=e581] [cursor=pointer]:
            - /url: https://www.youtube.com/@tarentogroup
            - img "https://www.youtube.com/@tarentogroup" [ref=e582]
      - generic [ref=e583]:
        - generic [ref=e585]:
          - link "WHAT WE DO" [ref=e587] [cursor=pointer]:
            - /url: /services
          - generic [ref=e589]:
            - link "Design & Strategy" [ref=e590] [cursor=pointer]:
              - /url: /services
              - generic [ref=e591]: Design & Strategy
            - list [ref=e592]:
              - listitem [ref=e593]:
                - link "LEAD Sprints" [ref=e594] [cursor=pointer]:
                  - /url: /services/lead-sprints/
              - listitem [ref=e595]:
                - link "Vector Sprints" [ref=e596] [cursor=pointer]:
                  - /url: /services/vector-sprints/
              - listitem [ref=e597]:
                - link "Business Tech Consulting" [ref=e598] [cursor=pointer]:
                  - /url: /services/business-technology-consulting/
              - listitem [ref=e599]:
                - link "Experience Design" [ref=e600] [cursor=pointer]:
                  - /url: /services/transform-user-engagement-through-research-driven-design/
              - listitem [ref=e601]:
                - link "Product Strategy" [ref=e602] [cursor=pointer]:
                  - /url: /services/product-strategy-define-market-fit-before-development-begins/
          - generic [ref=e604]:
            - link "Artificial Intelligence" [ref=e605] [cursor=pointer]:
              - /url: /services
              - generic [ref=e606]: Artificial Intelligence
            - list [ref=e607]:
              - listitem [ref=e608]:
                - link "Tarento AI" [ref=e609] [cursor=pointer]:
                  - /url: https://tarento.ai/
              - listitem [ref=e610]:
                - link "Generative & Agentic AI" [ref=e611] [cursor=pointer]:
                  - /url: /services/generative-agentic-ai/
              - listitem [ref=e612]:
                - link "Language AI" [ref=e613] [cursor=pointer]:
                  - /url: /services/language-ai/
              - listitem [ref=e614]:
                - link "Classical AI" [ref=e615] [cursor=pointer]:
                  - /url: /services/classical-ai/
          - generic [ref=e617]:
            - link "ERP Solutions" [ref=e618] [cursor=pointer]:
              - /url: /services
              - generic [ref=e619]: ERP Solutions
            - list [ref=e620]:
              - listitem [ref=e621]:
                - link "SAP Ecosystem" [ref=e622] [cursor=pointer]:
                  - /url: /services/sap-ecosystem/
              - listitem [ref=e623]:
                - link "Infor" [ref=e624] [cursor=pointer]:
                  - /url: /services/infor-streamlining-industry-specific-business-processes/
              - listitem [ref=e625]:
                - link "Microsoft Dynamics" [ref=e626] [cursor=pointer]:
                  - /url: /services/microsoft-dynamics/
          - generic [ref=e628]:
            - link "Integration" [ref=e629] [cursor=pointer]:
              - /url: /services
              - generic [ref=e630]: Integration
            - list [ref=e631]:
              - listitem [ref=e632]:
                - link "Enterprise Integration" [ref=e633] [cursor=pointer]:
                  - /url: /services/enterprise-integration/
        - generic [ref=e635]:
          - generic [ref=e637]:
            - link "Engineering" [ref=e638] [cursor=pointer]:
              - /url: /services
              - generic [ref=e639]: Engineering
            - list [ref=e640]:
              - listitem [ref=e641]:
                - link "Application Development" [ref=e642] [cursor=pointer]:
                  - /url: /services/application-development/
              - listitem [ref=e643]:
                - link "Cloud & DevOps" [ref=e644] [cursor=pointer]:
                  - /url: /services/cloud-devops/
              - listitem [ref=e645]:
                - link "Product & Platform" [ref=e646] [cursor=pointer]:
                  - /url: /services/product-platform-engineering/
              - listitem [ref=e647]:
                - link "Application Modernization" [ref=e648] [cursor=pointer]:
                  - /url: /services/application-modernization/
              - listitem [ref=e649]:
                - link "Performance Engineering" [ref=e650] [cursor=pointer]:
                  - /url: /services/performance-engineering/
              - listitem [ref=e651]:
                - link "Data & Analytics" [ref=e652] [cursor=pointer]:
                  - /url: /services/data-analytics/
              - listitem [ref=e653]:
                - link "Quality Assurance & Automation" [ref=e654] [cursor=pointer]:
                  - /url: /services/quality-assurance/
          - generic [ref=e656]:
            - link "Enterprise Application Platforms" [ref=e657] [cursor=pointer]:
              - /url: /services
              - generic [ref=e658]: Enterprise Application Platforms
            - list [ref=e659]:
              - listitem [ref=e660]:
                - link "SAP BTP" [ref=e661] [cursor=pointer]:
                  - /url: /services/sap-btp/
          - generic [ref=e663]:
            - link "Managed Services" [ref=e664] [cursor=pointer]:
              - /url: /services
              - generic [ref=e665]: Managed Services
            - list [ref=e666]:
              - listitem [ref=e667]:
                - link "AI-Driven Operations" [ref=e668] [cursor=pointer]:
                  - /url: /services/ai-driven-operations/
              - listitem [ref=e669]:
                - link "ERP & App Management" [ref=e670] [cursor=pointer]:
                  - /url: /services/erp-app-management/
              - listitem [ref=e671]:
                - link "Data & Pipeline Managment" [ref=e672] [cursor=pointer]:
                  - /url: /services/data-pipeline-management/
        - generic [ref=e673]:
          - generic [ref=e674]:
            - link "SOLUTIONS" [ref=e676] [cursor=pointer]:
              - /url: /solutions
            - link "iVOLVE" [ref=e679] [cursor=pointer]:
              - /url: /integration/ivolve/
              - generic [ref=e680]: iVOLVE
            - link "DataVolve" [ref=e683] [cursor=pointer]:
              - /url: /solutions/datavolve/
              - generic [ref=e684]: DataVolve
            - link "RAIN" [ref=e687] [cursor=pointer]:
              - /url: https://nxt.tarento.com/rain/
              - generic [ref=e688]: RAIN
            - link "BOLT" [ref=e691] [cursor=pointer]:
              - /url: https://nxt.tarento.com/bolt-data-platform/
              - generic [ref=e692]: BOLT
            - link "THOR" [ref=e695] [cursor=pointer]:
              - /url: https://nxt.tarento.com/thor/
              - generic [ref=e696]: THOR
            - link "Styria" [ref=e699] [cursor=pointer]:
              - /url: /solutions/
              - generic [ref=e700]: Styria
            - link "Aurora" [ref=e703] [cursor=pointer]:
              - /url: /solutions/
              - generic [ref=e704]: Aurora
            - link "PULZ" [ref=e707] [cursor=pointer]:
              - /url: https://nxt.tarento.com/pulz/
              - generic [ref=e708]: PULZ
            - link "Glance" [ref=e711] [cursor=pointer]:
              - /url: https://glance.tarento.com/
              - generic [ref=e712]: Glance
            - link "Mimir AI" [ref=e715] [cursor=pointer]:
              - /url: /mimir-ai
              - generic [ref=e716]: Mimir AI
          - generic [ref=e717]:
            - link "INDUSTRIES" [ref=e719] [cursor=pointer]:
              - /url: /industries
            - link "Automotive" [ref=e722] [cursor=pointer]:
              - /url: /industries
              - generic [ref=e723]: Automotive
            - link "Education" [ref=e726] [cursor=pointer]:
              - /url: /industries
              - generic [ref=e727]: Education
            - link "Retail" [ref=e730] [cursor=pointer]:
              - /url: /industries
              - generic [ref=e731]: Retail
            - link "Manufacturing" [ref=e734] [cursor=pointer]:
              - /url: /industries
              - generic [ref=e735]: Manufacturing
            - link "Banking & Finance" [ref=e738] [cursor=pointer]:
              - /url: /industries
              - generic [ref=e739]: Banking & Finance
            - link "Foundations" [ref=e742] [cursor=pointer]:
              - /url: /industries
              - generic [ref=e743]: Foundations
        - generic [ref=e744]:
          - generic [ref=e745]:
            - generic [ref=e746]: COMPANY
            - link "About us" [ref=e749] [cursor=pointer]:
              - /url: /about/
              - generic [ref=e750]: About us
            - link "Brand" [ref=e753] [cursor=pointer]:
              - /url: https://strapi.tarento.com/uploads/Tarento_One_48ba4b45bc.pdf
              - generic [ref=e754]: Brand
            - link "Contact us" [ref=e757] [cursor=pointer]:
              - /url: /about/#contact
              - generic [ref=e758]: Contact us
            - link "Careers" [ref=e761] [cursor=pointer]:
              - /url: /careers
              - generic [ref=e762]: Careers
          - generic [ref=e763]:
            - generic [ref=e764]: RESOURCES
            - link "News" [ref=e767] [cursor=pointer]:
              - /url: /news
              - generic [ref=e768]: News
            - link "Articles" [ref=e771] [cursor=pointer]:
              - /url: /articles
              - generic [ref=e772]: Articles
            - link "Case Studies" [ref=e775] [cursor=pointer]:
              - /url: /case-studies
              - generic [ref=e776]: Case Studies
            - link "Blogs" [ref=e779] [cursor=pointer]:
              - /url: /blogs
              - generic [ref=e780]: Blogs
        - generic [ref=e781]:
          - generic [ref=e782]:
            - generic [ref=e783]: GLOBAL PRESENCE
            - link "Tarento Finland" [ref=e786] [cursor=pointer]:
              - /url: /fi/
              - generic [ref=e787]: Tarento Finland
            - link "Tarento Norway" [ref=e790] [cursor=pointer]:
              - /url: /norway/
              - generic [ref=e791]: Tarento Norway
            - link "Tarento Sweden" [ref=e794] [cursor=pointer]:
              - /url: /se
              - generic [ref=e795]: Tarento Sweden
            - link "Tarento USA" [ref=e798] [cursor=pointer]:
              - /url: /us/
              - generic [ref=e799]: Tarento USA
          - generic [ref=e800]:
            - generic [ref=e801]: MICROSITES
            - link "Design and Innovation" [ref=e804] [cursor=pointer]:
              - /url: https://nxt.tarento.com/
              - generic [ref=e805]: Design and Innovation
            - link "Graduate Hiring" [ref=e808] [cursor=pointer]:
              - /url: /grad-hiring/
              - generic [ref=e809]: Graduate Hiring
            - link "SAP Sapphire 2026" [ref=e812] [cursor=pointer]:
              - /url: /tarento-sap-sapphire-2026
              - generic [ref=e813]: SAP Sapphire 2026
    - paragraph [ref=e815]:
      - text: All rights reserved © 2026 Tarento Group. |
      - link "Privacy Policy" [ref=e816] [cursor=pointer]:
        - /url: /privacy-policy/
  - img "Thor Bot Avatar" [ref=e819] [cursor=pointer]
  - alert [ref=e820]:
    - generic [ref=e821]:
      - paragraph [ref=e824]:
        - text: We use cookies to enhance the experience on our website. To know more please read our
        - link "Privacy Policy" [ref=e825] [cursor=pointer]:
          - /url: /privacy-policy/
      - button "\"I agree\"" [ref=e827] [cursor=pointer]: I agree
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('Explore Industries flow', async ({ page }) => {
  4  |   // Step 1: Navigate to https://www.tarento.com
  5  |   await page.goto('https://www.tarento.com');
  6  |   await expect(page).toHaveURL(/tarento\.com/);
  7  | 
  8  |   // Step 2: Click 'Industries' in the main navigation
  9  |   await page.getByRole('navigation').first().getByRole('link', { name: 'Industries' }).click();
  10 |   await expect(page).toHaveURL(/industries/i);
  11 | 
  12 |   // Step 3: Browse industries served - verify the industries page has loaded with content
  13 |   await page.waitForLoadState('networkidle');
  14 | 
  15 |   const pageHeading = page.getByRole('heading').first();
  16 |   await expect(pageHeading).toBeVisible();
  17 | 
  18 |   // Look for industry sections/cards on the page
  19 |   const industryContent = page.locator('main, .content, #content, section').first();
  20 |   await expect(industryContent).toBeVisible();
  21 | 
  22 |   // Step 4: Review digital solutions offered per industry
  23 |   // Get all industry links or sections
  24 |   const industryLinks = page.getByRole('link').filter({ hasText: /healthcare|finance|education|retail|banking|government|media|insurance|technology|public/i });
  25 |   const industryCount = await industryLinks.count();
  26 | 
  27 |   if (industryCount > 0) {
  28 |     // Click on the first industry to review its digital solutions
  29 |     const firstIndustryLink = industryLinks.first();
  30 |     const firstIndustryText = await firstIndustryLink.textContent();
  31 |     await firstIndustryLink.click();
> 32 |     await page.waitForLoadState('networkidle');
     |                ^ Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
  33 | 
  34 |     // Verify we navigated to an industry-specific page
  35 |     const solutionsHeading = page.getByRole('heading').first();
  36 |     await expect(solutionsHeading).toBeVisible();
  37 | 
  38 |     // Go back and explore another industry if available
  39 |     await page.goBack();
  40 |     await page.waitForLoadState('networkidle');
  41 |   } else {
  42 |     // If no specific industry links found, look for industry sections on the page
  43 |     const sections = page.locator('section, .industry-card, .card, article');
  44 |     const sectionCount = await sections.count();
  45 |     expect(sectionCount).toBeGreaterThanOrEqual(0);
  46 | 
  47 |     // Scroll through the page to browse content
  48 |     await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  49 |     await page.waitForTimeout(500);
  50 |     await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  51 |     await page.waitForTimeout(500);
  52 |   }
  53 | 
  54 |   // Verify the page still has visible content after browsing
  55 |   const bodyContent = page.locator('body');
  56 |   await expect(bodyContent).toBeVisible();
  57 | });
```