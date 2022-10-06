import { useIsFocused, useNavigationState } from "@react-navigation/native"
import * as React from "react"
import {
  Alert,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native"
import {
  Camera,
  CameraPermissionStatus,
  useCameraDevices,
} from "react-native-vision-camera"
import EStyleSheet from "react-native-extended-stylesheet"
import Svg, { Circle } from "react-native-svg"
import Icon from "react-native-vector-icons/Ionicons"
import Paste from "react-native-vector-icons/FontAwesome"
import { Screen } from "../../components/screen"
import { parsePaymentDestination } from "@galoymoney/client"
import { palette } from "../../theme/palette"
import type { ScreenType } from "../../types/jsx"
import { getParams } from "js-lnurl"
import Reanimated from "react-native-reanimated"
import { RootStackParamList } from "../../navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"
import useToken from "../../hooks/use-token"
import useMainQuery from "@app/hooks/use-main-query"
import Clipboard from "@react-native-community/clipboard"
import { useI18nContext } from "@app/i18n/i18n-react"
import RNQRGenerator from "rn-qr-generator"
import { BarcodeFormat, useScanBarcodes } from "vision-camera-code-scanner"
import ImagePicker from "react-native-image-crop-picker"

const { width: screenWidth } = Dimensions.get("window")
const { height: screenHeight } = Dimensions.get("window")

const styles = EStyleSheet.create({
  close: {
    alignSelf: "flex-end",
    height: 64,
    marginRight: 16,
    marginTop: 40,
    width: 64,
  },

  openGallery: {
    height: 128,
    left: 32,
    position: "absolute",
    top: screenHeight - 96,
    width: screenWidth,
  },

  // eslint-disable-next-line react-native/no-color-literals
  rectangle: {
    backgroundColor: "transparent",
    borderColor: palette.blue,
    borderWidth: 2,
    height: screenWidth * 0.65,
    width: screenWidth * 0.65,
  },

  rectangleContainer: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },

  noPermissionsView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.black,
  },
})

type ScanningQRCodeScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, "sendBitcoinDestination">
}

export const ScanningQRCodeScreen: ScreenType = ({
  navigation,
}: ScanningQRCodeScreenProps) => {
  const index = useNavigationState((state) => state.index)
  const [pending, setPending] = React.useState(false)
  const { tokenNetwork } = useToken()
  const { myPubKey } = useMainQuery()
  const { LL } = useI18nContext()
  const devices = useCameraDevices()
  const [cameraPermissionStatus, setCameraPermissionStatus] =
    React.useState<CameraPermissionStatus>("not-determined")
  const isFocused = useIsFocused()
  const [frameProcessor, barcodes] = useScanBarcodes([BarcodeFormat.QR_CODE], {
    checkInverted: true,
  })
  const device = devices.back

  const requestCameraPermission = React.useCallback(async () => {
    const permission = await Camera.requestCameraPermission()
    if (permission === "denied") await Linking.openSettings()
    setCameraPermissionStatus(permission)
  }, [])

  React.useEffect(() => {
    if (cameraPermissionStatus !== "authorized") {
      requestCameraPermission()
    }
  }, [cameraPermissionStatus, navigation, requestCameraPermission])

  const decodeInvoice = React.useCallback(
    async (data: string) => {
      if (pending) {
        return
      }
      try {
        const { valid, lnurl } = parsePaymentDestination({
          destination: data,
          network: tokenNetwork,
          pubKey: myPubKey,
        })

        if (valid) {
          if (lnurl) {
            setPending(true)
            const lnurlParams = await getParams(lnurl)

            if ("reason" in lnurlParams) {
              throw lnurlParams.reason
            }

            switch (lnurlParams.tag) {
              case "payRequest":
                if (index <= 1) {
                  navigation.replace("sendBitcoinDestination", {
                    payment: data,
                  })
                } else {
                  navigation.navigate("sendBitcoinDestination", {
                    payment: data,
                  })
                }
                break
              default:
                Alert.alert(
                  LL.ScanningQRCodeScreen.invalidTitle(),
                  LL.ScanningQRCodeScreen.invalidContentLnurl({
                    found: lnurlParams.tag,
                  }),
                  [
                    {
                      text: LL.common.ok(),
                      onPress: () => setPending(false),
                    },
                  ],
                )
                break
            }
          } else if (index <= 1) {
            navigation.replace("sendBitcoinDestination", { payment: data })
          } else {
            navigation.navigate("sendBitcoinDestination", { payment: data })
          }
        } else {
          setPending(true)
          Alert.alert(
            LL.ScanningQRCodeScreen.invalidTitle(),
            LL.ScanningQRCodeScreen.invalidContent({
              found: data.toString(),
            }),
            [
              {
                text: LL.common.ok(),
                onPress: () => setPending(false),
              },
            ],
          )
        }
      } catch (err) {
        Alert.alert(err.toString())
      }
    },
    [
      LL.ScanningQRCodeScreen,
      LL.common,
      index,
      myPubKey,
      navigation,
      pending,
      tokenNetwork,
    ],
  )

  React.useEffect(() => {
    if (barcodes.length > 0 && barcodes[0].rawValue) {
      decodeInvoice(barcodes[0].rawValue)
    }
  }, [barcodes, decodeInvoice])

  const handleInvoicePaste = async () => {
    try {
      Clipboard.getString().then((data) => {
        decodeInvoice(data)
      })
    } catch (err) {
      Alert.alert(err.toString())
    }
  }

  const showImagePicker = async () => {
    try {
      const response = await ImagePicker.openPicker({})
      let qrCodeValues
      if (Platform.OS === "ios" && response.sourceURL) {
        qrCodeValues = await RNQRGenerator.detect({ uri: response.sourceURL })
      }
      if (Platform.OS === "android" && response.path) {
        qrCodeValues = await RNQRGenerator.detect({ uri: response.path })
      }
      if (qrCodeValues?.values?.length > 0) {
        decodeInvoice(qrCodeValues.values[0])
      } else {
        Alert.alert(LL.ScanningQRCodeScreen.noQrCode())
      }
    } catch (err) {
      Alert.alert(err.toString())
    }
  }

  if (cameraPermissionStatus !== "authorized") {
    return <View style={styles.noPermissionsView} />
  }

  return (
    <Screen unsafe>
      <View style={StyleSheet.absoluteFill}>
        {device && (
          <Reanimated.View style={StyleSheet.absoluteFill}>
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={isFocused}
              frameProcessor={frameProcessor}
              frameProcessorFps={5}
            />
          </Reanimated.View>
        )}
        <View style={styles.rectangleContainer}>
          <View style={styles.rectangle} />
        </View>
        <Pressable onPress={navigation.goBack}>
          <View style={styles.close}>
            <Svg viewBox="0 0 100 100">
              <Circle cx={50} cy={50} r={50} fill={palette.white} opacity={0.5} />
            </Svg>
            <Icon
              name="ios-close"
              size={64}
              // eslint-disable-next-line react-native/no-inline-styles
              style={{ position: "absolute", top: -2 }}
            />
          </View>
        </Pressable>
        <View style={styles.openGallery}>
          <Pressable onPress={showImagePicker}>
            <Icon
              name="image"
              size={64}
              color={palette.lightGrey}
              // eslint-disable-next-line react-native/no-inline-styles
              style={{ opacity: 0.8 }}
            />
          </Pressable>
          <Pressable onPress={handleInvoicePaste}>
            <Paste
              name="paste"
              size={64}
              color={palette.lightGrey}
              // eslint-disable-next-line react-native/no-inline-styles
              style={{ opacity: 0.8, position: "absolute", bottom: "5%", right: "15%" }}
            />
          </Pressable>
        </View>
      </View>
    </Screen>
  )
}
