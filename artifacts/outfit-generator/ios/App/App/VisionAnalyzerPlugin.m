/**
 * VisionAnalyzerPlugin.m — ObjC bridge for VisionAnalyzer Capacitor plugin.
 *
 * This file registers the plugin so Capacitor's web layer can call it
 * via registerPlugin('VisionAnalyzer').
 *
 * After adding both files to the Xcode project (Build Phases → Compile Sources),
 * clean and rebuild.  No other Xcode configuration is needed.
 */
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(VisionAnalyzer, "VisionAnalyzer",
    CAP_PLUGIN_METHOD(analyze, CAPPluginReturnPromise);
)
