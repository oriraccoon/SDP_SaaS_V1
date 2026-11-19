import { PlatformConfig, ProductMapping, CourierConfig } from '../types';

export const DEFAULT_COURIERS: CourierConfig[] = [
  {
    id: "cj_logistics",
    name: "CJ대한통운",
    start_row: 1, // 2행부터 데이터 (1-based 기준 2행)
    tracking_col: 1, // B열 (송장번호)
    courier_col: 0,  // A열 (택배사명)
    name_col: 6,     // G열 (수령인)
    phone_col: 8,    // I열 (연락처)
    zip_col: 9,      // J열 (우편번호)
    addr_col: 11,    // L열 (주소)
    prod_col: 12,    // M열 (상품명)
    unit_col: 13,    // N열 (옵션/용량)
    qty_col: 14      // O열 (수량)
  },
  {
    id: "lotte_glogis",
    name: "롯데택배",
    start_row: 1, // 2행부터 데이터
    tracking_col: 2, // C열
    courier_col: 1,  // B열
    name_col: 4,     // E열
    phone_col: 6,    // G열
    zip_col: 7,      // H열
    addr_col: 8,     // I열
    prod_col: 9,     // J열
    unit_col: 10,    // K열
    qty_col: 11      // L열
  },
  {
    id: "hanjin_express",
    name: "한진택배",
    start_row: 1, // 2행부터 데이터 (1-based 기준 2행)
    tracking_col: 3, // D열 (운송장번호)
    courier_col: -1,
    name_col: 19,    // T열 (수취인명)
    phone_col: 20,   // U열 (전화번호)
    zip_col: 24,     // Y열 (우편번호)
    addr_col: 25,    // Z열 (주소)
    prod_col: 41,    // AP열 (상품명)
    unit_col: 43,    // AR열 (옵션명)
    qty_col: 42      // AQ열 (수량)
  }
];

export const COURIER_PRESETS: { name: string; id: string; config: Omit<CourierConfig, 'id' | 'name'> }[] = [
  {
    name: "CJ대한통운 표준 템플릿",
    id: "cj_preset",
    config: {
      start_row: 1,
      tracking_col: 1,
      courier_col: 0,
      name_col: 6,
      phone_col: 8,
      zip_col: 9,
      addr_col: 11,
      prod_col: 12,
      unit_col: 13,
      qty_col: 14
    }
  },
  {
    name: "롯데택배 표준 템플릿",
    id: "lotte_preset",
    config: {
      start_row: 1,
      tracking_col: 2,
      courier_col: 1,
      name_col: 4,
      phone_col: 6,
      zip_col: 7,
      addr_col: 8,
      prod_col: 9,
      unit_col: 10,
      qty_col: 11
    }
  },
  {
    name: "한진택배 표준 템플릿",
    id: "hanjin_preset",
    config: {
      start_row: 1,
      tracking_col: 3,
      courier_col: -1,
      name_col: 19,
      phone_col: 20,
      zip_col: 24,
      addr_col: 25,
      prod_col: 41,
      unit_col: 43,
      qty_col: 42
    }
  },
  {
    name: "우체국택배 표준 템플릿",
    id: "epost_preset",
    config: {
      start_row: 1,
      tracking_col: 1,
      courier_col: 0,
      name_col: 3,
      phone_col: 5,
      zip_col: 6,
      addr_col: 7,
      prod_col: 8,
      unit_col: 9,
      qty_col: 10
    }
  },
  {
    name: "로젠택배 표준 템플릿",
    id: "ilogen_preset",
    config: {
      start_row: 1,
      tracking_col: 1,
      courier_col: 0,
      name_col: 3,
      phone_col: 5,
      zip_col: 6,
      addr_col: 7,
      prod_col: 8,
      unit_col: 9,
      qty_col: 10
    }
  }
];

export const PLATFORM_PRESETS: { name: string; id: string; config: Omit<PlatformConfig, 'id' | 'name'> }[] = [
  {
    name: "기본 양식 (일반 엑셀)",
    id: "default_preset",
    config: {
      identifier: "",
      start_row: 1,
      col_map: {
        용량: 0,
        상품명: 1,
        수량: 2,
        수령인: 3,
        연락처: 4,
        우편번호: 5,
        주소: 6,
        배송메시지: 7
      },
      tracking_col: 8,
      courier_col: 9,
      filepath_pattern: ""
    }
  },
  {
    name: "쿠팡",
    id: "coupang_preset",
    config: {
      identifier: "묶음배송번호",
      start_row: 1,
      col_map: {
        용량: 11, // L (등록옵션명)
        상품명: 12, // M (노출상품명)
        수량: 22, // W (구매수)
        수령인: 26, // AA (수취인명)
        연락처: 27, // AB (수취인번호)
        우편번호: 28, // AC (우편번호)
        주소: 29, // AD (수취인주소)
        배송메시지: 30 // AE (배송메세지)
      },
      tracking_col: 4, // E열
      courier_col: 3, // D열
      filepath_pattern: "DeliveryList"
    }
  },
  {
    name: "네이버 스마트스토어",
    id: "naver_preset",
    config: {
      identifier: "주문번호",
      start_row: 2,
      col_map: {
        용량: 24, // Y (등록옵션명)
        상품명: 20, // U (노출상품명)
        수량: 26, // AA (구매수)
        수령인: 13, // N (수취인명)
        연락처: 48, // AW (수취인번호)
        우편번호: 54, // BC (우편번호)
        주소: 50, // AY (수취인주소)
        배송메시지: 55 // BD (배송메세지)
      },
      tracking_col: 8, // I열
      courier_col: 7, // H열
      filepath_pattern: "스마트스토어"
    }
  },
  {
    name: "토스",
    id: "toss_preset",
    config: {
      identifier: "주문배송관리",
      start_row: 4,
      col_map: {
        용량: 11, // L열 (12번째)
        상품명: 8, // I열 (9번째)
        수량: 12, // M열 (13번째)
        수령인: 17, // R열 (18번째)
        연락처: 18, // S열 (19번째)
        주소: 19, // T열 (20번째)
        우편번호: 20, // U열 (21번째)
        배송메시지: 21 // V열 (22번째)
      },
      tracking_col: 6, // G열 (7번째)
      courier_col: 5, // F열 (6번째)
      filepath_pattern: "주문배송관리"
    }
  },
  {
    name: "식봄",
    id: "sikbom",
    config: {
      identifier: "발송관리_",
      start_row: 1,
      col_map: {
        용량: 17, // R (18번째 열)
        상품명: 4, // E (5번째 열)
        수량: 16, // Q (17번째 열)
        수령인: 10, // K (11번째 열)
        연락처: 28, // AC (29번째 열)
        우편번호: 30, // AE (31번째 열)
        주소: 31, // AF (32번째 열)
        배송메시지: 36 // AK (37번째 열)
      },
      tracking_col: 7, // H (8번째 열)
      courier_col: 6, // G (7번째 열)
      filepath_pattern: "발송관리_, 식봄"
    }
  },
  {
    name: "올웨이즈",
    id: "always",
    config: {
      identifier: "찬코리아",
      start_row: 1,
      col_map: {
        용량: 5, // F (6번째 열)
        상품명: 4, // E (5번째 열)
        수량: 6, // G (7번째 열)
        수령인: 18, // S (19번째 열)
        연락처: 19, // T (20번째 열)
        우편번호: 15, // P (16번째 열)
        주소: 14, // O (15번째 열)
        배송메시지: 36 // AK (37번째 열)
      },
      tracking_col: 22, // W (23번째 열)
      courier_col: 20, // U (21번째 열)
      filepath_pattern: "찬코리아"
    }
  },
  {
    name: "G마켓(옥션ESM)",
    id: "ESM",
    config: {
      identifier: "발송관리",
      start_row: 1,
      col_map: {
        용량: 17, // R (18번째 열)
        상품명: 4, // E (5번째 열)
        수량: 16, // Q (17번째 열)
        수령인: 10, // K (11번째 열)
        연락처: 28, // AC (29번째 열)
        우편번호: 30, // AE (31번째 열)
        주소: 31, // AF (32번째 열)
        배송메시지: 36 // AK (37번째 열)
      },
      tracking_col: 7, // H (8번째 열)
      courier_col: 6, // G (7번째 열)
      filepath_pattern: "발송관리, esm, g마켓"
    }
  }
];

export const DEFAULT_PLATFORMS: PlatformConfig[] = [
  {
    id: "default_platform",
    name: "기본 양식 (일반 엑셀)",
    identifier: "",
    start_row: 1,
    col_map: {
      용량: 0,
      상품명: 1,
      수량: 2,
      수령인: 3,
      연락처: 4,
      우편번호: 5,
      주소: 6,
      배송메시지: 7
    },
    tracking_col: 8,
    courier_col: 9,
    filepath_pattern: ""
  },
  {
    id: "coupang",
    name: "쿠팡",
    identifier: "묶음배송번호",
    start_row: 1,
    col_map: {
      용량: 11, // L (등록옵션명)
      상품명: 12, // M (노출상품명)
      수량: 22, // W (구매수)
      수령인: 26, // AA (수취인명)
      연락처: 27, // AB (수취인번호)
      우편번호: 28, // AC (우편번호)
      주소: 29, // AD (수취인주소)
      배송메시지: 30 // AE (배송메세지)
    },
    tracking_col: 4, // E열 (5번째)
    courier_col: 3,
    filepath_pattern: "DeliveryList"
  },
  {
    id: "naver",
    name: "네이버 스마트스토어",
    identifier: "주문번호",
    start_row: 2,
    col_map: {
      용량: 24, // Y (등록옵션명)
      상품명: 20, // U (노출상품명)
      수량: 26, // AA (구매수)
      수령인: 13, // N (수취인명)
      연락처: 48, // AW (수취인번호)
      우편번호: 54, // BC (우편번호)
      주소: 50, // AY (수취인주소)
      배송메시지: 55 // BD (배송메세지)
    },
    tracking_col: 8, // I열 (9번째)
    courier_col: 7, // H열
    filepath_pattern: "스마트스토어"
  },
  {
    id: "toss",
    name: "토스",
    identifier: "주문배송관리",
    start_row: 4,
    col_map: {
      용량: 11, // L열 (12번째)
      상품명: 8, // I열 (9번째)
      수량: 12, // M열 (13번째)
      수령인: 17, // R열 (18번째)
      연락처: 18, // S열 (19번째)
      주소: 19, // T열 (20번째)
      우편번호: 20, // U열 (21번째)
      배송메시지: 21 // V열 (22번째)
    },
    tracking_col: 6, // G열 (7번째)
    courier_col: 5, // F열 (6번째)
    filepath_pattern: "주문배송관리"
  },
  {
    id: "sikbom",
    name: "식봄",
    identifier: "발송관리_",
    start_row: 1,
    col_map: {
      용량: 17, // R (18번째 열)
      상품명: 4, // E (5번째 열)
      수량: 16, // Q (17번째 열)
      수령인: 10, // K (11번째 열)
      연락처: 28, // AC (29번째 열)
      우편번호: 30, // AE (31번째 열)
      주소: 31, // AF (32번째 열)
      배송메시지: 36 // AK (37번째 열)
    },
    tracking_col: 7, // H (8번째 열)
    courier_col: 6, // G (7번째 열)
    filepath_pattern: "발송관리_, 식봄"
  },
  {
    id: "always",
    name: "올웨이즈",
    identifier: "찬코리아",
    start_row: 1,
    col_map: {
      용량: 5, // F (6번째 열)
      상품명: 4, // E (5번째 열)
      수량: 6, // G (7번째 열)
      수령인: 18, // S (19번째 열)
      연락처: 19, // T (20번째 열)
      우편번호: 15, // P (16번째 열)
      주소: 14, // O (15번째 열)
      배송메시지: 36 // AK (37번째 열)
    },
    tracking_col: 22, // W (23번째 열)
    courier_col: 20, // U (21번째 열)
    filepath_pattern: "찬코리아"
  },
  {
    id: "ESM",
    name: "G마켓(옥션ESM)",
    identifier: "발송관리",
    start_row: 1,
    col_map: {
      용량: 17, // R (18번째 열)
      상품명: 4, // E (5번째 열)
      수량: 16, // Q (17번째 열)
      수령인: 10, // K (11번째 열)
      연락처: 28, // AC (29번째 열)
      우편번호: 30, // AE (31번째 열)
      주소: 31, // AF (32번째 열)
      배송메시지: 36 // AK (37번째 열)
    },
    tracking_col: 7, // H (8번째 열)
    courier_col: 6, // G (7번째 열)
    filepath_pattern: "발송관리, esm, g마켓"
  }
];

export const DEFAULT_PRODUCT_MAPPINGS: ProductMapping[] = [
  { rawName: '국내제조 비린맛 없는 절단 돌산 간장 꽃게장', mappedName: '게장' },
  { rawName: '그린 웰빙 업소용 국산 반달 슬라이스 단무지', mappedName: '반달단무지' },
  { rawName: '그린이에프앤에스 업소용 양념깻잎', mappedName: '양념깻잎' },
  { rawName: '꼬들꼬들 간장무꼬들이 장아찌 무 장아찌', mappedName: '무꼬들' },
  { rawName: '늘푸른 뜨락 국내제조 업소용 알마늘지', mappedName: '알마늘' },
  { rawName: '더 맛있는 간장고추장아찌 고추장아찌', mappedName: '간장고추' },
  { rawName: '더 맛있는 간장고추지 업소용 고추장아찌', mappedName: '간장고추' },
  { rawName: '명태품은 백명란', mappedName: '명란' },
  { rawName: '볶아조린 국산서리태조림 업소용 콩조림', mappedName: '서리태조림' },
  { rawName: '볶아조린 대두콩조림 메주콩자반 업소용 콩조림', mappedName: '대두조림' },
  { rawName: '볶아조린 땅콩조림 업소용 콩조림', mappedName: '땅콩' },
  { rawName: '양념 반찬 여우마을 무말랭이 절임류', mappedName: '무말랭이' },
  { rawName: '업소용 대용량 단풍콩잎 장아찌', mappedName: '단풍콩잎' },
  { rawName: '업소용 매실청간장생깻잎 장아찌', mappedName: '매실깻잎' },
  { rawName: '여우마을 국내제조 국산 순태젓갈 갈치속젓', mappedName: '순태' },
  { rawName: '여우마을 국내제조 상큼상큼 오이피클', mappedName: '오이피클' },
  { rawName: '여우마을 노랑콩잎 단풍콩잎 장아찌', mappedName: '단풍콩잎' },
  { rawName: '여우마을 대구 북성로 냉동 완조리 간장 연탄불고기 5팩', mappedName: '간장연탄' },
  { rawName: '여우마을 명태품은 특 창란젓갈', mappedName: '양념창란' },
  { rawName: '여우마을 봄에새싹 명이나물 장아찌', mappedName: '명이나물' },
  { rawName: '여우마을 수제반찬 고추장 오징어실채 볶음', mappedName: '실채' },
  { rawName: '여우마을 수제반찬 국산 된장 청양고추 장아찌', mappedName: '국산된고' },
  { rawName: '여우마을 수제반찬 국산 된장청양고추장아찌', mappedName: '국산된고' },
  { rawName: '여우마을 국산 된장청양고추장아찌', mappedName: '국산된고' },
  { rawName: '여우마을 국산 된장 청양고추 장아찌', mappedName: '국산된고' },
  { rawName: '국산 된장 청양고추 장아찌', mappedName: '국산된고' },
  { rawName: '국산 된장청양고추장아찌', mappedName: '국산된고' },
  { rawName: '여우마을 수제반찬 국산 양념 청양고추 장아찌', mappedName: '국산양고' },
  { rawName: '여우마을 수제반찬 국산 양념청양고추장아찌', mappedName: '국산양고' },
  { rawName: '여우마을 국산 양념청양고추장아찌', mappedName: '국산양고' },
  { rawName: '여우마을 국산 양념 청양고추 장아찌', mappedName: '국산양고' },
  { rawName: '국산 양념 청양고추 장아찌', mappedName: '국산양고' },
  { rawName: '국산 양념청양고추장아찌', mappedName: '국산양고' },
  { rawName: '여우마을 수제반찬 달콤담백 양대콩조림 강낭콩조림', mappedName: '양대조림' },
  { rawName: '여우마을 수제반찬 더 맛있는 간장 청양고추장아찌', mappedName: '청양간장' },
  { rawName: '여우마을 수제반찬 더 맛있는 간장마늘쫑 업소용 마늘쫑장아찌', mappedName: '간장마늘쫑' },
  { rawName: '여우마을 수제반찬 된장깻잎 장아찌', mappedName: '된장깻잎' },
  { rawName: '여우마을 수제반찬 맛있는 오징어땅콩진미채 볶음', mappedName: '땅콩진미' },
  { rawName: '여우마을 수제반찬 매콤달콤 고추장양념 건새우볶음', mappedName: '건새우' },
  { rawName: '여우마을 수제반찬 매콤새콤 밥도둑 도라지무침 당일제조', mappedName: '도라지' },
  { rawName: '여우마을 수제반찬 볶아조린 국산서리태조림 국산 콩자반', mappedName: '서리태조림' },
  { rawName: '여우마을 수제반찬 볶아조린 대두콩조림 노란콩조림 메주콩자반', mappedName: '대두조림' },
  { rawName: '여우마을 수제반찬 볶아조린 땅콩조림 콩자반', mappedName: '땅콩' },
  { rawName: '여우마을 수제반찬 수제 완조리 냉동 소고기 육전', mappedName: '육전' },
  { rawName: '여우마을 수제반찬 아삭아삭 국산 연근조림', mappedName: '연근' },
  { rawName: '여우마을 수제반찬 아삭이고추 된장무침', mappedName: '아삭이고추' },
  { rawName: '여우마을 수제반찬 영양만점 모듬콩조림 견과류조림', mappedName: '여러콩' },
  { rawName: '여우마을 수제반찬 원하는 크기로 잘라먹는 양념 긴마늘쫑무침', mappedName: '긴마늘쫑' },
  { rawName: '여우마을 수제반찬 제주품은 국산 더덕무침', mappedName: '더덕' },
  { rawName: '여우마을 수제반찬 진짜 연탄에 구운 대구 북성로 완조리 연탄불고기 간장맛고추장맛 묶음 간장맛 고추장맛 1세트', mappedName: '연탄세트' },
  { rawName: '여우마을 수제반찬 진짜진짜 맛있는 고추장 진미채볶음', mappedName: '진미채' },
  { rawName: '여우마을 수제반찬 촌스러운 국산 우엉채조림 김밥용우엉', mappedName: '우엉' },
  { rawName: '여우마을 수제반찬 촌스러운 궁채장아찌', mappedName: '간장궁채' },
  { rawName: '여우마을 수제반찬 촌스러운 꽈리고추 고추장멸치볶음', mappedName: '멸치' },
  { rawName: '여우마을 수제반찬 촌스러운 된장고추무침 고추장아찌', mappedName: '된장고추' },
  { rawName: '여우마을 수제반찬 촌스러운 땅콩조림', mappedName: '생땅콩' },
  { rawName: '여우마을 수제반찬 촌스러운 양념고추장아찌 고추무침', mappedName: '양념고추' },
  { rawName: '여우마을 수제반찬 촌스러운 양념조개젓갈', mappedName: '양념조개' },
  { rawName: '여우마을 수제반찬 화끈하게 매운 된장땡초 청양고추무침', mappedName: '땡초' },
  { rawName: '여우마을 양념깻잎 무침 장아찌', mappedName: '양념깻잎' },
  { rawName: '여우마을 양념깻잎무침', mappedName: '양념깻잎' },
  { rawName: '여우마을 양념무말랭이 무침', mappedName: '무말랭이' },
  { rawName: '여우마을 업소용 매실청간장생깻잎 장아찌', mappedName: '매실깻잎' },
  { rawName: '여우마을 업소용 산고추', mappedName: '산고추' },
  { rawName: '여우마을 업소용 오징어젓갈', mappedName: '오징어' },
  { rawName: '여우마을 업소용 유림 양념 오징어젓갈 특오징어젓갈', mappedName: '오징어' },
  { rawName: '여우마을 자연곡물 청자5호 국산서리태 햇콩', mappedName: '곡물서리태' },
  { rawName: '여우마을 자연곡물 햇콩 붉은 강낭콩 양대콩', mappedName: '곡물강낭콩' },
  { rawName: '여우마을 쫄깃쫄깃 오징어젓갈', mappedName: '오징어' },
  { rawName: '원하프락교한양총알배송', mappedName: '락교' },
  { rawName: '지호 업소용 국내제조 고추채 절임', mappedName: '고추채' },
  { rawName: '촌스러운 양념고추장아찌 업소용 고추장아찌', mappedName: '양념고추' },
  { rawName: '하나 업소용 단무지 알밥용 김밥용', mappedName: '알밥단무지' },
  { rawName: '여우마을 수제반찬 곤약 꽈리고추 메추리알 장조림 당일제조', mappedName: '메추리알' },
  { rawName: '한정판매 국산 통마늘 장아찌 통마늘지', mappedName: '통마늘' },
  { rawName: '여우마을 대구 북성로 냉동 완조리 간장 연탄불고기 10팩', mappedName: '간장연탄' },
  { rawName: '여우마을 대구 북성로 냉동 완조리 고추장 연탄불고기', mappedName: '고추장연탄' },
  { rawName: '여우마을 양념조개젓 조개젓', mappedName: '양념조개' },
  { rawName: '여우마을 볶아조린 대두콩조림 노란콩조림', mappedName: '대두조림' },
  { rawName: '유림 양념오징어젓갈 대용량식자재 업소용', mappedName: '오징어' },
  { rawName: '여우마을 달콤담백 양대콩조림 강낭콩조림', mappedName: '양대조림' },
  { rawName: '여우마을 촌스러운 줄기상추 장아찌 간장궁채 장아찌', mappedName: '간장궁채' },
  { rawName: '한 장씩 직접구운 100% 수제 완조리 소고기 육전', mappedName: '육전' }
];
